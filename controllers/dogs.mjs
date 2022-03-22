import later from '@breejs/later';
later.date.localTime();
const dateOptions = { weekday:"long", year:"numeric", month:"short", day:"numeric"};

// Create schedule for notifications (monthly)
const generateLaterSchedule = (freqInMth, startDay, startMonth) => {
  return later.parse.recur().every(freqInMth).month().on('09:00').time().on(startDay).dayOfMonth().startingOn(startMonth).month();
}

export default function initDogsController(db, pool) {
  // Render dog profile -----------------------------
  const show = (req, res) => {
    const queryDogInfo = pool.query('SELECT * FROM dogs WHERE id=$1;', [req.params.id]);
    const queryMedSched = pool.query(`
      SELECT med_sched.id AS sched_id, meds.name AS medication, meds.description, start_date, number_of_doses, frequencies.freq_string, frequencies.freq_in_months, med_sched.notes
      FROM med_sched
      INNER JOIN meds
      ON med_sched.meds_id=meds.id
      INNER JOIN frequencies
      ON frequency_id=frequencies.id
      INNER JOIN dogs
      ON med_sched.dog_id=dogs.id
      WHERE dogs.id=$1
      ORDER BY med_sched.id ASC;
    `, [req.params.id])
    Promise.all([queryDogInfo, queryMedSched])
      .then((allResults) => {
        const content = {
          dogInfo: allResults[0].rows[0],
          medScheds: allResults[1].rows,
          userInfo: req.userInfo,
          id: req.userInfo?.id ?? null,
        };

        const schedIds = content.medScheds.map(schedObj=>schedObj.sched_id);
        const queryScheds = schedIds.map(id=> pool.query(`
            SELECT current_dose, total_doses
            FROM sched_msgs
            WHERE sched_id=${id};
        `));

        Promise.all(queryScheds)
          .then(resultScheds => {
              const resultDoses = resultScheds.map(result=>result.rows[0]);
              const dosesLeft = resultDoses.map(obj=>obj?.total_doses-obj?.current_dose);
              content.medScheds.forEach((schedObj,i) => schedObj.done = dosesLeft[i]===0?true:false);
              content.medScheds.forEach(schedObj=>{
                if (!schedObj.done) {
                  const date = new Date(schedObj.start_date);
                  const sched = generateLaterSchedule(schedObj.freq_in_months, date.getDate(), date.getMonth());
                  schedObj.nextDose = later.schedule(sched).next().toLocaleDateString('en-GB', dateOptions);
                }
              })
            
            res.render('dog-profile', content);
          })
          .catch(err=>console.log(err))
      })
      .catch(err=>console.log(err))
  };

  // Render add dog form ----------------------------
  const createForm = (req, res) => {
    const content = { 
      id: req.userInfo?.id ?? null,
      type: req.query.type ?? null,
    };
    res.render('forms/add-dog', content);
  };

  // POST: new dog ---------------------------------
  const create = (req, res) => {
    const { name, breed, notes } = req.body;
    const dogInfo = [
      name,
      breed,
      notes,
      req.userInfo.id,
    ];
    const query = `
      INSERT INTO dogs (name, breed, notes, user_id) VALUES ($1, $2, $3, $4) RETURNING id;
    `;
    pool
      .query(query, dogInfo)
      .then((result) => {
        const id = result.rows[0].id;
        res.redirect(`/dog/${id}`);
      })
      .catch((err) => {
        console.log(err)
        res.redirect('/new-dog?type=error')
      });
  };

  // Render edit dog form ---------------------------
  const edit = (req,res) => {
    const dogId = [req.params.id];
    const queryDog = `
      SELECT * FROM dogs WHERE id=$1;
    `;
    pool.query(queryDog, dogId)
      .then((result) => {
        const content = { 
          id: req.userInfo?.id ?? null,
          dogInfo: result.rows[0],
        };
        res.render('forms/edit-dog', content);
      }); 
  }

  // POST: edit dog ---------------------------------
  const update = (req, res) => {
    const { name, breed, notes } = req.body;
    const dogInfo = [
      name ?? "",
      breed ?? "",
      notes ?? "",
      req.params.id,
    ];
    console.log(dogInfo);
    const query = `
      UPDATE dogs SET name=$1, breed=$2, notes=$3 WHERE id=$4;
    `;
    pool
      .query(query, dogInfo)
      .then(res.redirect(`/dog/${req.params.id}`))
      .catch((err) => console.log(err));
  };

  // POST: edit dog ---------------------------------
  const destroy = (req, res) => {
    const dogId = [req.params.id];
    const query = `
      DELETE FROM dogs WHERE id=$1;
    `;
    pool
      .query(query, dogId)
      .then(result=>{
        console.log(result);
        res.redirect(`/profile`)
      })
      .catch((err) => console.log(err));
  };

  return {
    show,
    createForm,
    create,
    edit,
    update,
    destroy
  }
}