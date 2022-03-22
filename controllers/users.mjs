import jsSha from 'jssha';

const generateHash = (input) => {
	const unhashedStr = `${input}x${process.env.SALT}`;
	const shaObj = new jsSha('SHA-512', 'TEXT', { encoding: 'UTF8' });
	shaObj.update(unhashedStr);
	return shaObj.getHash('HEX'); //hashedString
};

export default function initUsersController(db, pool) {

  // Render index page ------------------------------
  const home = (req, res) => {
    if (req.isUserLoggedIn) {
      const dogs = req.userInfo.dogInfo; // Array of dogs (objects) and all their info 
    const dogIds = req.userInfo.dogInfo.map(dog=>dog.id); // Just the ids of the user's dogs
    // Query schedules for each dog id
    const queryDogsScheds = dogIds.map(id=>pool.query(`
      SELECT med_sched.id AS sched_id, meds.name AS medication, frequencies.freq_string, med_sched.number_of_doses
      FROM med_sched 
      INNER JOIN dogs 
      ON dogs.id=med_sched.dog_id 
      INNER JOIN meds
      ON meds.id=med_sched.meds_id
      INNER JOIN frequencies
      ON frequencies.id=med_sched.frequency_id
      WHERE dog_id=${id};
    `));
    Promise.all(queryDogsScheds)
      .then(resultDogsScheds => {
        const allDogsAndTheirScheds = [];
        dogs.forEach((dog,i)=>{
          const scheds = resultDogsScheds[i].rows;
          allDogsAndTheirScheds.push({
            dogInfo: dog,
            schedInfo: scheds // schedInfo has sched_id, medication, freq_string, doses, sched_done
          });
        });
        const content = {
          userInfo: req.userInfo,
          dogsAndScheds: allDogsAndTheirScheds, // Array of objects (dogs), with dogInfo and schedInfo keys
          id: req.userInfo?.id ?? null,
        };
        res.render('user-home', content)
      });
      // res.render('user-home', req.userInfo);
      return;
    }
    res.render('public-home', { id: null });
  };


  // Render signup form -----------------------------
  const createForm = (req, res) => {
    const content = {
      id: req.userInfo?.id ?? null,
      type: req.query.type ?? null,
    };
    res.render('forms/user-signup', content);
  };

  // POST: user signup  -----------------------------
  const create = (req, res) => {
    const userInfo = [req.body.email, generateHash(req.body.password)];
    const query = `
      INSERT INTO users (email, password) VALUES ($1, $2) RETURNING email;
    `;
    pool
      .query(query, userInfo)
      .then((result) => res.redirect(`/login?email=${result.rows[0].email}&type=signup-success`))
      .catch((err) => {
        console.log('Error creating new user', err.stack);
        res.redirect('/signup?type=error')
      });
  };

  // Render user profile ----------------------------
  const show = (req, res) => {
    const dogs = req.userInfo.dogInfo; // Array of dogs (objects) and all their info 
    const dogIds = req.userInfo.dogInfo.map(dog=>dog.id); // Just the ids of the user's dogs
    // Query schedules for each dog id
    const queryDogsScheds = dogIds.map(id=>pool.query(`
      SELECT med_sched.id AS sched_id, meds.name AS medication, frequencies.freq_string, med_sched.number_of_doses
      FROM med_sched 
      INNER JOIN dogs 
      ON dogs.id=med_sched.dog_id 
      INNER JOIN meds
      ON meds.id=med_sched.meds_id
      INNER JOIN frequencies
      ON frequencies.id=med_sched.frequency_id
      WHERE dog_id=${id};
    `));
    Promise.all(queryDogsScheds)
      .then(resultDogsScheds => {
        const allDogsAndTheirScheds = [];
        dogs.forEach((dog,i)=>{
          const scheds = resultDogsScheds[i].rows;
          allDogsAndTheirScheds.push({
            dogInfo: dog,
            schedInfo: scheds // schedInfo has sched_id, medication, freq_string, doses, sched_done
          });
        });
        const content = {
          userInfo: req.userInfo,
          dogsAndScheds: allDogsAndTheirScheds, // Array of objects (dogs), with dogInfo and schedInfo keys
          id: req.userInfo?.id ?? null,
        };
        res.render('user-profile', content)
      });
  };

  // Render create user profile form ----------------
  const edit = (req, res) => {
    const content = {
      userInfo: req.userInfo,
      id: req.userInfo?.id ?? null,};
    res.render('forms/create-user', content)
  };


  // POST: create user profile ---------------------
  const update = (req, res) => {
    // take name, insert into 
    const userInfo = [req.body.name, req.body.tele_id, req.userInfo.id];
    const query = `
      UPDATE users SET name=$1, tele_id=$2 WHERE id=$3;
    `;
    pool.query(query, userInfo)
      .then((result) => { 
        console.log(result.rows); 
        res.redirect('/profile');
      } )
  }

  
  // Render login page ------------------------------
  const loginForm = (req, res) => {
    // If user is logged in, redirect to home page
    if (req.isUserLoggedIn || req.cookies.loggedIn) {
      res.redirect('/');
      return;
    }
    const content = { 
      id: req.userInfo?.id ?? null,
      email: req.query.email ?? null, 
      type: req.query.type ?? null,
    };
    res.render('forms/login', content);
  };

  
  // POST: user login  ------------------------------
  const login = (req, res) => {
    const userEmail = [req.body.email];
    const emailQuery = `SELECT id, password FROM users WHERE email=$1;`;
    pool
      .query(emailQuery, userEmail)
      .then((result) => {
        const userId = result.rows[0].id;
        const storedPassword = result.rows[0].password;
        if (generateHash(req.body.password) === storedPassword) {
          res.cookie(`userId=${userId};`);
          res.cookie(`loggedIn=${generateHash(userId)};`);
          res.redirect('/');
          return;
        }
        res.redirect('/login?type=error');
        return;
      })
      .catch((err) => {
        console.log(err);
        res.redirect('/login?type=error');
      });
  };

  // Log user out
  const logout = (req, res, next) => {
    req.isUserLoggedIn = false;
    res.clearCookie('loggedIn').clearCookie('userId');
    console.log(`user ${req.cookies.userId} logging out`);
    console.log(`user logged in: ${req.isUserLoggedIn}`);
    if (req.url === '/logout') {
      res.redirect('/');
      return;
    }
    next();
  };

  return {
    home,
    createForm,
    create,
    show,
    edit,
    update,
    loginForm,
    login,
    logout
  }
}