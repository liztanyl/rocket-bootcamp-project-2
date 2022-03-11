import express from 'express';
import pg from 'pg';
import cookieParser from 'cookie-parser';
import jsSha from 'jssha';
import later from '@breejs/later';
import { notify, demoNotify } from './tele-notif.js'

// ################################################
// ###########     INITIALISATION 1    ############
// ################################################

// Initialise pool for Postgres
const { Pool } = pg;
let pgConfigs;

if (process.env.DATABASE_URL) {
  pgConfigs = {
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  }
} else {
  pgConfigs = {
    user: 'liztanyl',
    host: 'localhost',
    database: 'project_2',
    port: 5432,
  }
}

const pool = new Pool(pgConfigs);

later.date.localTime();
const dateOptions = { weekday:"long", year:"numeric", month:"short", day:"numeric"};


// ################################################
// ###########     HELPER FUNCTIONS     ###########
// ################################################

const generateHash = (input) => {
	const unhashedStr = `${input}x${process.env.SALT}`;
	const shaObj = new jsSha('SHA-512', 'TEXT', { encoding: 'UTF8' });
	shaObj.update(unhashedStr);
	return shaObj.getHash('HEX'); //hashedString
};

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

// ################################################
// ############     ROUTE HANDLERS     ############
// ################################################

// <<<<<<<<<<<< GET HANDLERS FOR PAGES >>>>>>>>>>>>

// Render index page ------------------------------
const showIndexPage = (req, res) => {
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

// Render user profile ----------------------------
const showUserProfile = (req, res) => {
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

// Render dog profile -----------------------------
const showDogProfile = (req, res) => {
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

// Render individual medication schedule page -----
const showIndivSchedListing = (req, res) => {
  console.log('schedule page pt 1');

  console.log(pgConfigs);
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
      console.log('schedule page pt 2');
      const startDate = new Date(result.rows[0].start_date);
      console.log(startDate);
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

//
// <<<<<<<<<<<< GET HANDLERS FOR FORMS >>>>>>>>>>>>

// Render signup form -----------------------------
const showSignupPage = (req, res) => {
  const content = {
    id: req.userInfo?.id ?? null,
    type: req.query.type ?? null,
  };
	res.render('forms/user-signup', content);
};

// Render login page ------------------------------
const showLoginPage = (req, res) => {
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

// Render create user profile form ----------------
const showUserProfileForm = (req, res) => {
  const content = {
    userInfo: req.userInfo,
    id: req.userInfo?.id ?? null,};
  res.render('forms/create-user', content)
};

// Render add dog form ----------------------------
const showCreateDogForm = (req, res) => {
  const content = { 
    id: req.userInfo?.id ?? null,
    type: req.query.type ?? null,
  };
	res.render('forms/add-dog', content);
};

// Render edit dog form ---------------------------
const showEditDogForm = (req,res) => {
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

// Render create medication schedule form ---------
const showCreateSchedForm = (req, res) => {
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


// TO DEMO TELEGRAM SCHEDULE (START MESSAGE + 3 REMINDERS AT 10SEC INTERVAL)
const demoNotificationSchedule = (req, res) => {
  let d = new Date();
  console.log(d)
  d.setSeconds(d.getSeconds() + 15);
  console.log(d)
  const msgData = {
    dogName: 'Kaya',
    medication: 'Simparica® Trio',
    totalDoses: 3,
    startDate: d.toLocaleDateString('en-GB', dateOptions),
    freqStr: 'once in 10 seconds',
  };

  let remainingDoses = 3;

  const startMsg = `*Woof\\! Your schedule has been set up\\.* \n\nWe will remind you to give ${msgData.dogName} a dose of ${msgData.medication} ${msgData.freqStr}, starting ${msgData.startDate}\\.`;

  const sendReminder = () => {    
    console.log(`DEMO SCHEDULE
      - Total Number of Doses: 3
      - Current Dose: ${3-remainingDoses+1}
      - Sending reminder now: ${new Date()}`);

    const msg = `*Woof woof\\! Don't paw\\-get to give ${msgData.dogName} a dose of ${msgData.medication} today\\!* \n\nThis is dose ${3-remainingDoses+1} out of ${msgData.totalDoses}\\.`;

    demoNotify(encodeURI(msg))
    
    remainingDoses -= 1;
    console.log('Doses remaining: ', remainingDoses);

    if (remainingDoses <= 0) { 
      console.log(`<< Reminder schedule complete >>
        DEMO SCHEDULE
        - Final reminder sent on: ${new Date()}`);
      t.clear();
    }
  }
  
  const sched = later.parse.recur().every(10).second();

  const t = later.setInterval(sendReminder, sched);
  
  demoNotify(encodeURI(startMsg));

  res.redirect('/');
};


//
// <<<<<<<<<<<<<<<< POST HANDLERS >>>>>>>>>>>>>>>>

// POST: user signup  -----------------------------
const handleNewUserSignup = (req, res) => {
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

// POST: user login  ------------------------------
const handleUserLogin = (req, res) => {
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

// POST: create user profile ---------------------
const handleEditUserProfile = (req, res) => {
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

// POST: new dog ---------------------------------
const handleNewDog = (req, res) => {
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

// POST: edit dog ---------------------------------
const handleEditDog = (req, res) => {
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
const handleDeleteDog = (req, res) => {
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

// POST: new medication schedule ------------------
const handleNewSchedule = (req, res) => {
  console.log('POST new sched start');
  const { dog_id, meds_id, start_date, number_of_doses, frequency_id, notes } = req.body;
  const formInfo = [dog_id, meds_id, start_date, number_of_doses, frequency_id, notes];
  const insertQuery = `
    INSERT INTO med_sched (dog_id, meds_id, start_date, number_of_doses, frequency_id, notes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id;
  `;
  pool.query(insertQuery, formInfo)
    .then(result => {
      console.log('POST new sched first query result');
      console.log(result.rows[0].id)
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
          console.log('POST new sched second query result');
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
            console.log('POST newsched bef redirect', pgConfigs)
          res.redirect(`/schedule/${schedData.sched_id}`)
        })
    })
    .catch(err => console.log(err))
};

// ################################################
// ##############     MIDDLEWARE     ##############
// ################################################

// Authenticate user ------------------------------
const checkAuth = (req, res, next) => {
	if (preAuthPaths.includes(req.path)) {
		console.log('skipping auth at', req.url);
		next();
		return;
	}
	req.isUserLoggedIn = false;
	// Authenticate loggedIn cookie with hashed userId
	if (req.cookies.loggedIn === generateHash(req.cookies.userId)) {
		const queryUser = pool.query(`
        SELECT id, email, name, tele_id, image_id
        FROM users 
        WHERE id=$1;`, 
      [req.cookies.userId]);
    const queryDogs = pool.query(`SELECT * FROM dogs WHERE user_id=$1;`, [req.cookies.userId]);
    const queryScheds = pool.query(`
        SELECT med_sched.id AS schedId, dogs.name AS dog, meds.name AS medication, number_of_doses AS doses, frequencies.freq_string AS freq
        FROM med_sched 
        INNER JOIN meds
        ON med_sched.meds_id=meds.id
        INNER JOIN frequencies
        ON frequencies.id=med_sched.frequency_id
        INNER JOIN dogs
        ON dogs.id=med_sched.dog_id
        INNER JOIN users
        ON users.id=dogs.user_id
        WHERE user_id=$1;`, 
      [req.cookies.userId]);
		Promise.all([queryUser, queryDogs, queryScheds])
			.then((result) => {
				req.isUserLoggedIn = true;
				req.userInfo = result[0].rows[0];
        req.userInfo.dogInfo = result[1].rows;
        req.userInfo.schedInfo = result[2].rows;
				console.log(`checkAuth --- done checking auth at '${req.url}' --- user ${req.cookies.userId} logged in: ${req.isUserLoggedIn}`
				);
				next();
			})
			.catch((err) => {
        console.log(err);
        res.redirect('/logout');
      });
		return;
	}
	console.log(`done checking auth at '${req.url}' ----- user logged in: ${req.isUserLoggedIn}`);
	if (req.url === '/') {
		next();
		return;
	}
	res.redirect('/login');
};

// Log user out
const handleUserLogout = (req, res, next) => {
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



// ################################################
// ##########     INITIALISE EXPRESS     ##########
// ################################################

const app = express();
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(checkAuth);

const PORT = process.env.PORT || 3004;

const preAuthPaths = ['/signup', '/login', '/logout', '/styles.css'];

// ################################################
// ################     ROUTES     ################
// ################################################

// Home, login, logout ----------------------------
app.get('/', showIndexPage);

app.route('/login').get(showLoginPage).post(handleUserLogin);
app.get('/logout', handleUserLogout);

// Signup -----------------------------------------
app
	.route('/signup')
	.get(handleUserLogout, showSignupPage)
	.post(handleNewUserSignup);

// User profile -----------------------------------
app.get('/profile', showUserProfile);

app.route('/edit-profile')
  .get(showUserProfileForm)
  .post(handleEditUserProfile);

// Dog profile ------------------------------------
app.get('/dog/:id', showDogProfile);

app.route('/new-dog')
  .get(showCreateDogForm)
  .post(handleNewDog);

app.route('/dog/:id/edit')
  .get(showEditDogForm)
  .post(handleEditDog);

app.get('/dog/:id/delete', handleDeleteDog);

// Medication schedule ----------------------------
app.route('/new-schedule')
  .get(showCreateSchedForm)
  .post(handleNewSchedule);

app.get('/schedule/:id', showIndivSchedListing);

// Telegram notification demo ---------------------
app.get('/demo-schedule', demoNotificationSchedule)

// ################################################
// ################################################

app.listen(PORT);