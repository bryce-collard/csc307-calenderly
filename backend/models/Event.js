const mongoose = require('mongoose');

const { Schema } = mongoose;

const interviewerSchema = new mongoose.Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
  availability: [Boolean],
});

const intervieweeSchema = new mongoose.Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
  timeChosen: Date,
});

const eventSchema = new mongoose.Schema({
  title: String,
  description: String,
  interviewers: [interviewerSchema],
  interviewees: [intervieweeSchema],
  startDate: Date,
  endDate: Date,
  interviewersNeeded: Number,
  availabilityIncrement: Number,
});

module.exports = mongoose.model('Event', eventSchema);