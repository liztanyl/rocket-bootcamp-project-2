import later from '@breejs/later';
import { notify } from './../tele-notif.js'

later.date.localTime();
const dateOptions = { weekday:"long", year:"numeric", month:"short", day:"numeric"};


// Create schedule for notifications (monthly)
const generateLaterSchedule = (freqInMth, startDay, startMonth) => {
  return later.parse.recur().every(freqInMth).month().on('09:00').time().on(startDay).dayOfMonth().startingOn(startMonth).month();
}

// Create object for Telegram message
const storeDataForMsg = (userTeleId, schedInfo) => {
  const formStartDate = new Date(schedInfo.start_date);
  return {
    teleId: userTeleId,
    dogName: schedInfo.dog_name,
    medication: schedInfo.medication,
    totalDoses: schedInfo.number_of_doses,
    startDate: formStartDate.toLocaleDateString('en-GB', dateOptions),
    startDay: formStartDate.getDate(),
    startMonth: formStartDate.getMonth() + 1,
    freqStr: schedInfo.freq_string.toLowerCase(),
    freqInMth: schedInfo.freq_in_months,
  };
}

export default function initSchedulesController(db, pool) {
  // Render individual medication schedule page -----
  const show = (req, res) => {

    const query = `
      SELECT med_sched.id, dog_id, dogs.name AS dog, dogs.image_id AS dog_photo_path, meds.name AS medication, meds.description, start_date, number_of_doses, frequencies.freq_string, frequencies.freq_in_months, med_sched.notes
      FROM med_sched
      INNER JOIN meds
      ON med_sched.meds_id=meds.id
      INNER JOIN frequencies
      ON frequency_id=frequencies.id
      INNER JOIN dogs
      ON med_sched.dog_id=dogs.id
      WHERE med_sched.id=$1;
    `;
    pool.query(query, [req.params.id])
      .then(result => {
        const startDate = new Date(result.rows[0].start_date);
        let sched = later.parse.recur().every(result.rows[0].freq_in_months).month().on(startDate.getDate()).dayOfMonth().startingOn(startDate.getMonth()+1).month();

        let scheds = later.schedule(sched).next(result.rows[0].number_of_doses);
        if (!Array.isArray(scheds)) scheds = Array.of(scheds);
        scheds = scheds.map(date=>date.toLocaleDateString('en-GB', dateOptions));
        
        const content = {
          medInfo: result.rows[0],
          schedInfo: scheds,
          id: req.userInfo?.id ?? null,
        };

        res.render('med-sched-indiv', content);
      })
  }

  
  // Render create medication schedule form ---------
  const createForm = (req, res) => {
    const queryDogs = pool.query('SELECT * FROM dogs WHERE user_id=$1;', [
      req.userInfo.id,
    ]);
    const queryMeds = pool.query('SELECT * FROM meds ORDER BY name ASC;');
    const queryFrequencies = pool.query('SELECT * FROM frequencies;');
    Promise.all([queryDogs, queryMeds, queryFrequencies]).then((result) => {
      const content = {
        dogs: result[0].rows,
        meds: result[1].rows,
        frequencies: result[2].rows,
        id: req.userInfo?.id ?? null, };
      res.render('forms/add-sched', content);
    });
  };

  // POST: new medication schedule ------------------
  const create = (req, res) => {
    const { dog_id, meds_id, start_date, number_of_doses, frequency_id, notes } = req.body;
    const formInfo = [dog_id, meds_id, start_date, number_of_doses, frequency_id, notes];
    const insertQuery = `
      INSERT INTO med_sched (dog_id, meds_id, start_date, number_of_doses, frequency_id, notes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id;
    `;
    pool.query(insertQuery, formInfo)
      .then(result => {
        const queryInfo = `
          SELECT med_sched.id AS sched_id, med_sched.start_date, med_sched.number_of_doses, meds.name AS medication, freq_string, freq_in_months, dogs.name AS dog_name
          FROM med_sched
          INNER JOIN meds
          ON meds.id=med_sched.meds_id
          INNER JOIN frequencies
          ON frequencies.id=med_sched.frequency_id
          INNER JOIN dogs
          ON dogs.id=med_sched.dog_id
          WHERE med_sched.id=$1;
        `;
        pool.query(queryInfo, [result.rows[0].id])
          .then(result2 => {
            const schedData = result2.rows[0];
            const msgData = storeDataForMsg(req.userInfo.tele_id, schedData);
            let remainingDoses = schedData.number_of_doses;

            const startMsg = `*Woof\\! Your schedule has been set up\\.* \n\nWe will remind you to give ${msgData.dogName} a dose of ${msgData.medication} ${msgData.freqStr}, starting ${msgData.startDate}\\.`;

            const sendReminder = () => {
              const schedInfo = {
                schedId: schedData.sched_id,
                currentDose: msgData.totalDoses - remainingDoses + 1,
                totalDoses: msgData.totalDoses,
                done: ((msgData.totalDoses - remainingDoses + 1) === msgData.totalDoses) ? true : false,
              };
              
              console.log(`Schedule ID: ${schedInfo.schedId}
                - Total Number of Doses: ${schedInfo.totalDoses}
                - Current Dose: ${schedInfo.currentDose}
                - Sending reminder now: ${new Date()}`);
              
              const msg = `*Woof woof\\! Don't paw\\-get to give ${msgData.dogName} a dose of ${msgData.medication} today\\!* \n\nThis is dose ${msgData.totalDoses-remainingDoses+1} out of ${msgData.totalDoses}\\.`

              notify(msgData.teleId, encodeURI(msg), schedInfo)
              
              remainingDoses -= 1;
              console.log('Doses remaining: ', remainingDoses);

              if (remainingDoses <= 0) { 
                console.log(`<< Reminder schedule complete >>
                  Schedule ID: ${schedData.sched_id}
                  - Final reminder sent on: ${new Date()}`);
                t.clear();
              }
            }
            
            const sched = generateLaterSchedule(
              msgData.freqInMth, 
              msgData.startDay, 
              msgData.startMonth
            );

            const t = later.setInterval(sendReminder, sched);
            
            notify(msgData.teleId, encodeURI(startMsg), {
                schedId: schedData.sched_id,
                currentDose: 0,
                totalDoses: msgData.totalDoses,
                done: false,
              });
            res.redirect(`/schedule/${schedData.sched_id}`)
          })
      })
      .catch(err => console.log(err))
  };

  return {
    show,
    createForm,
    create
  }
}