import express from 'express';
import pg from 'pg';
import cookieParser from 'cookie-parser';
import jsSha from 'jssha';
import later from '@breejs/later';
import { demoNotify } from './tele-notif.js'
import bindRoutes from './routes.mjs';

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


// ################################################
// ############     ROUTE HANDLERS     ############
// ################################################

//
// <<<<<<<<<<<< GET HANDLERS FOR FORMS >>>>>>>>>>>>


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

bindRoutes(app);

// ################################################
// ################################################

app.listen(PORT);