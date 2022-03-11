import axios from 'axios';
import pg from 'pg';
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

const BOT_TOKEN = "5167017911:AAFqKvtF1NGjQUcLMQP8k5mitDrkUeEHI0M";

export const notify = (teleUserId, message, schedInfo) => {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage?chat_id=${teleUserId}&text=${message}&parse_mode=MarkdownV2`;

  axios.get(url)
    .then((response) => {
      console.log(JSON.stringify(response.data));
      const msgId = response.data.result.message_id; // unique message id
      // INSERT data into sched_msgs table
      // (sched_id, msg_id, tele_id, current_dose, total_doses, done)
      const { schedId, currentDose, totalDoses, done } = schedInfo;
      const schedData = [schedId, msgId, teleUserId, currentDose, totalDoses, done];
      const insertQuery = `
        INSERT INTO sched_msgs (sched_id, msg_id, tele_id, current_dose, total_doses, sched_done)
        VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;
        `;
      pool.query(insertQuery, schedData)
      .then((result) => console.log(result.rows))
    })
    .catch((err) => console.log(err));
}

export const demoNotify = (message) => {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage?chat_id=55078913&text=${message}&parse_mode=MarkdownV2`;

  axios.get(url)
    .catch((err) => console.log(err));
}