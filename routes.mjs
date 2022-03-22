import pg from 'pg';
import initDogsController from './controllers/dogs.mjs';
import initSchedulesController from './controllers/schedules.mjs';
import initUsersController from './controllers/users.mjs';

// Initialise pool for Postgres
const { Pool } = pg;
let pgConfigs;

pgConfigs = {
	user: 'liztanyl',
	host: 'localhost',
	database: 'project_2',
	port: 5432,
};

const pool = new Pool(pgConfigs);

export default function bindRoutes(app) {
	const dogsController = initDogsController('db', pool);
	const usersController = initUsersController('db', pool);
	const schedulesController = initSchedulesController('db', pool);

	// // Home, login, logout ----------------------------
	app.get('/', usersController.home);

	app
		.route('/login')
		.get(usersController.loginForm)
		.post(usersController.login);

	app.get('/logout', usersController.logout);

	// Signup -----------------------------------------
	app
		.route('/signup')
		.get(usersController.logout, usersController.createForm)
		.post(usersController.create);

	// User profile -----------------------------------
	app.get('/profile', usersController.show);

	app
		.route('/edit-profile')
		.get(usersController.edit)
		.post(usersController.update);

	// // Dog profile ------------------------------------
	app.get('/dog/:id', dogsController.show);

	app
		.route('/new-dog')
		.get(dogsController.createForm)
		.post(dogsController.create);

	app
		.route('/dog/:id/edit')
		.get(dogsController.edit)
		.post(dogsController.update);

	app.get('/dog/:id/delete', dogsController.destroy);

	// // Medication schedule ----------------------------
	app
		.route('/new-schedule')
		.get(schedulesController.createForm)
		.post(schedulesController.create);

	app.get('/schedule/:id', schedulesController.show);
}
