CREATE TABLE IF NOT EXISTS images (
  id SERIAL PRIMARY KEY,
  filepath TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE,
  password TEXT,
  name TEXT,
  tele_id INTEGER UNIQUE,
  image_id INTEGER,
  CONSTRAINT fk_userimage
    FOREIGN KEY (image_id)
      REFERENCES images(id)
);

CREATE TABLE IF NOT EXISTS dogs (
  id SERIAL PRIMARY KEY,
  name TEXT,
  breed TEXT,
  notes TEXT,
  image_id INTEGER,
  user_id INTEGER NOT NULL,
  CONSTRAINT fk_dogimage
    FOREIGN KEY (image_id)
      REFERENCES images(id),
  CONSTRAINT fk_owner
    FOREIGN KEY (user_id)
      REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS meds (
  id SERIAL PRIMARY KEY,
  name TEXT,
  description TEXT
);

CREATE TABLE IF NOT EXISTS frequencies (
  id SERIAL PRIMARY KEY,
  freq_string TEXT,
  freq_in_months INTEGER
);

CREATE TABLE IF NOT EXISTS med_sched (
  id SERIAL PRIMARY KEY,
  dog_id INTEGER,
  meds_id INTEGER,
  start_date DATE,
  number_of_doses INTEGER,
  frequency_id INTEGER,
  notes TEXT,
  CONSTRAINT fk_medsched_dogid 
    FOREIGN KEY (dog_id)
      REFERENCES dogs(id)
      ON DELETE CASCADE,
  CONSTRAINT fk_medsched_medid
    FOREIGN KEY (meds_id)
      REFERENCES meds(id),
  CONSTRAINT fk_medsched_freqid
    FOREIGN KEY (frequency_id)
      REFERENCES frequencies(id)
);

CREATE TABLE IF NOT EXISTS sched_msgs (
  id SERIAL PRIMARY KEY,
  sched_id INTEGER,
  msg_id INTEGER,
  tele_id INTEGER,
  current_dose INTEGER,
  total_doses INTEGER,
  sched_done BOOLEAN,
  CONSTRAINT fk_user_teleid
    FOREIGN KEY (tele_id)
      REFERENCES users(tele_id)
);