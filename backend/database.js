const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

// Initialize SQLite database
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(__dirname, 'database.sqlite'),
  logging: false,
  pool: {
    max: 50,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
});

// Enable WAL mode for high concurrency reads/writes
sequelize.query('PRAGMA journal_mode=WAL;');

// Define the Assessment model
const Assessment = sequelize.define('Assessment', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  rollNumber: {
    type: DataTypes.STRING,
    allowNull: true
  },
  startTime: {
    type: DataTypes.DATE,
    allowNull: true
  },
  endTime: {
    type: DataTypes.DATE,
    allowNull: true
  },
  aptitudeScore: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  codingScore: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  codingMaxScore: {
    type: DataTypes.INTEGER,
    defaultValue: 30
  },
  codingDetails: {
    type: DataTypes.TEXT, 
    allowNull: true
  },
  interviewAnswers: {
    type: DataTypes.TEXT, 
    allowNull: true
  },
  interviewScore: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  feedback: {
    type: DataTypes.TEXT,
    allowNull: true
  }
});

// Define Authorized Candidate model
const AuthorizedCandidate = sequelize.define('AuthorizedCandidate', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  rollNumber: {
    type: DataTypes.STRING,
    allowNull: false
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  }
});

// Sync the database
const initDB = async () => {
  try {
    await sequelize.sync({ alter: true });
    console.log('Database synced successfully.');
  } catch (error) {
    console.error('Failed to sync database:', error);
  }
};

module.exports = {
  sequelize,
  Assessment,
  AuthorizedCandidate,
  initDB
};
