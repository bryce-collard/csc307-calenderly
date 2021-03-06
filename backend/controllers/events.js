const mongoose = require('mongoose');
const Event = require('../models/Event');
const User = require('../models/User');

module.exports.getEvents = async (req, res) => {
  const events = await Event.find();
  if (events) {
    res.send(events);
  } else {
    res.status(404).send('Couldn\'t get events');
  }
};

module.exports.getEvent = async (req, res) => {
  if (mongoose.Types.ObjectId.isValid(req.params.eventid)) {
    const e = await Event
      .findById(req.params.eventid)
      .populate('interviewees.userId interviewees.interviewers');

    if (e) {
      res.json(e);
    }
  } else {
    res.status(400).send('Invalid event id');
  }
};

const availabilityArray = (startDate, endDate) => {
  const aval = [];

  const start = new Date(startDate);
  const end = new Date(endDate);

  const times = new Array(8);
  times.fill(false);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    aval.push({ date: new Date(d), times });
  }

  return aval;
};

module.exports.createEvent = async (req, res) => {
  const avail = availabilityArray(req.body.startDate, req.body.endDate);
  const eventCreator = {
    userId: mongoose.Types.ObjectId(req.body.eventCreator),
    availability: avail,
  };

  const newEvent = new Event({
    title: req.body.title,
    description: req.body.description,
    interviewers: [eventCreator],
    startDate: req.body.startDate,
    endDate: req.body.endDate,
  });

  // save event
  newEvent.save().then((event) => {
    if (event) {
      // add this event to the creator's list of events
      User.findOneAndUpdate(
        { _id: mongoose.Types.ObjectId(req.body.eventCreator) },
        { $push: { events: { eventId: newEvent._id, role: 'interviewer' } } },
      ).then((user) => {
        if (user) {
          res.status(201).send(event);
        }
      });
    } else {
      res.status(404).send('Couldn\'t create event');
    }
  });
};

module.exports.deleteEvent = async (req, res) => {
  // delete the event
  Event.findByIdAndDelete(req.params.eventid).then((deletedEvent) => {
    if (deletedEvent) {
      // delete all references to the event in User collection
      User.updateMany(
        { events: { eventId: req.params.eventid } },
        { $pull: { events: { eventId: req.params.eventid } } },
      ).then(() => {
        res.status(204).send('Event deleted');
      });
    } else {
      res.status(404).send('Couldn\'t delete event');
    }
  });
};

module.exports.getTimeSlots = async (req, res) => {
  const event = await Event.findById(req.params.eventid);
  const { interviewers } = event;
  const model = interviewers[0].availability;

  for (let i = 0; i < model.length; i += 1) {
    for (let j = 0; j < model[i].times.length; j += 1) {
      let numInterviewersFree = 0;
      interviewers.forEach((intv) => {
        if (intv.availability[i].times[j]) {
          numInterviewersFree += 1;
        }
      });
      model[i].times[j] = numInterviewersFree >= event.interviewersNeeded;
    }
  }
  res.status(200).send(model);
};

module.exports.getEventInterviewers = async (req, res) => {
  if (mongoose.Types.ObjectId.isValid(req.params.eventid)) {
    const e = await Event.findById(req.params.eventid);
    if (e) {
      if (e.interviewers) {
        res.send(e.interviewers);
      } else {
        res.status(404).send('Coudn\'t get event interviewers');
      }
    }
  } else {
    res.status(400).send('Invalid event id');
  }
};

module.exports.getEventInterviewees = async (req, res) => {
  if (mongoose.Types.ObjectId.isValid(req.params.eventid)) {
    const e = await Event.findById(req.params.eventid);
    if (e) {
      if (e.interviewees) {
        res.send(e.interviewees);
      }
    }
  } else {
    res.status(400).send('Invalid event id');
  }
};

module.exports.updateAvailability = async (req, res) => {
  const eventId = req.params.eventid;

  if (!mongoose.Types.ObjectId.isValid(eventId)) {
    res.status(400).send('Invalid event id');
  }

  await Event.findOneAndUpdate({
    _id: eventId, interviewers: { $elemMatch: { _id: req.body.availId } },
  }, { $set: { 'interviewers.$.availability': req.body.avail } });

  res.status(201).send();
};

module.exports.updateTimeSlot = async (req, res) => {
  const eventId = req.params.eventid;

  if (!mongoose.Types.ObjectId.isValid(eventId)) {
    res.status(400).send('Invalid event id');
  }

  await Event.findOneAndUpdate({
    _id: eventId, interviewees: { $elemMatch: { userId: req.body.userId } },
  }, { $set: { 'interviewees.$.timeChosen': req.body.timeChosen } });

  res.status(201).send();
};

module.exports.addInterviewer = async (req, res) => {
  // get user by email
  const user = await User.findOne({ email: req.body.email });
  if (!user) {
    res.status(404).send('No user exists with this email address');
    return;
  }
  if (!mongoose.Types.ObjectId.isValid(req.params.eventid)) {
    res.status(400).send('Invalid event id');
  }

  const event = await Event.findById(req.params.eventid);
  const avail = availabilityArray(event.startDate, event.endDate);
  Event.updateOne(
    { _id: req.params.eventid, 'interviewers.userId': { $ne: user._id }, 'interviewees.userId': { $ne: user._id } },
    { $push: { interviewers: { userId: user._id, availability: avail } } },
  ).then((updated) => {
    if (!updated) {
      res.status(404).send('Couldn\'t update event');
    }
    // add event to list in user (if not already added)
    User.updateOne(
      { _id: user._id, 'events.eventId': { $ne: req.params.eventid } },
      { $push: { events: { eventId: req.params.eventid, role: 'interviewer' } } },
    ).then((updatedUser) => {
      if (!updatedUser) {
        res.status(404).send('Couldn\'t update user');
      }
      Event.findById(req.params.eventid)
        .then((updatedEvent) => res.status(200)
          .send({ message: `${updated.n} user(s) added successfully`, event: updatedEvent }));
    });
  });
};

module.exports.addInterviewee = async (req, res) => {
  // get user by email
  const user = await User.findOne({ email: req.body.email });
  if (!user) {
    res.status(404).send('No user exists with this email address');
    return;
  }
  if (!mongoose.Types.ObjectId.isValid(req.params.eventid)) {
    res.status(400).send('Invalid event id');
    return;
  }

  Event.updateOne({
    _id: req.params.eventid,
    'interviewees.userId': { $ne: user._id },
    'interviewers.userId': { $ne: user._id },
  }, { $push: { interviewees: { userId: user._id } } })
    .then((updated) => {
      if (!updated) {
        res.status(404).send('Couldn\'t update event');
        return;
      }

      // add event to list in user (if not already added)
      User.updateOne({
        _id: user._id,
        'events.eventId': { $ne: req.params.eventid },
      },
      { $push: { events: { eventId: req.params.eventid, role: 'interviewee' } } })
        .then((updatedUser) => {
          if (!updatedUser) {
            res.status(404).send('Couldn\'t update user');
            return;
          }

          Event.findById(req.params.eventid).then((updatedEvent) => {
            res.status(200).json({
              message: `${updated.n} user(s) added successfully`,
              event: updatedEvent,
            });
          });
        });
    });
};

module.exports.deleteInterviewer = async (req, res) => {
  await Event.updateOne(
    { _id: req.params.eventid },
    { $pull: { interviewers: { userId: req.body.userId } } },
  ).then(() => {
    User.updateOne(
      { _id: req.body.userId },
      { $pull: { events: { eventId: req.params.eventid, role: 'interviewer' } } },
    );
  });
  const updatedEvent = await Event.findById(req.params.eventid);
  res.status(200).send(updatedEvent);
};

module.exports.deleteInterviewee = async (req, res) => {
  await Event.updateOne(
    { _id: req.params.eventid },
    { $pull: { interviewees: { userId: req.body.userId } } },
  ).then(() => {
    User.updateOne(
      { _id: req.body.userId },
      { $pull: { events: { eventId: req.params.eventid, role: 'interviewee' } } },
    );
  });
  const updatedEvent = await Event.findById(req.params.eventid);
  res.status(200).send(updatedEvent);
};

module.exports.updateEvent = async (req, res) => {
  if (mongoose.Types.ObjectId.isValid(req.params.eventid)) {
    const e = await Event.findById(req.params.eventid);
    if (e) {
      if (req.body.title) {
        e.title = req.body.title;
      }
      if (req.body.description) {
        e.description = req.body.description;
      }
      if (req.body.startDate) {
        e.startDate = req.body.startDate;
      }
      if (req.body.endDate) {
        e.endDate = req.body.endDate;
      }
      if (req.body.interviewersNeeded) {
        e.interviewersNeeded = req.body.interviewersNeeded;
      }
      e.save().then(() => {
        res.status(200).send({ message: 'Event updated', event: e });
      });
    } else {
      res.status(404).send('Event not found');
    }
  }
};

module.exports.interviewViewee = async (req, res) => {
  const { eventid, viewid } = req.params;
  const { viewerid } = req.body;

  if (!mongoose.Types.ObjectId.isValid(eventid)) {
    res.status(404).send('Invalid event id');
    return;
  }

  if (!mongoose.Types.ObjectId.isValid(viewid)
    || !mongoose.Types.ObjectId.isValid(viewerid)) {
    res.status(404).send('Event not found');
    return;
  }

  // TODO make sure only viewers can interview
  const e = await Event.findOneAndUpdate({
    _id: eventid, interviewees: { $elemMatch: { _id: viewid } },
  }, { $push: { 'interviewees.$.interviewers': viewerid } });

  res.send(e);
};

module.exports.interviewVieweeRemove = async (req, res) => {
  const { eventid, viewid } = req.params;
  const { viewerid } = req.body;

  if (!mongoose.Types.ObjectId.isValid(eventid)) {
    res.status(404).send('Invalid event id');
    return;
  }

  if (!mongoose.Types.ObjectId.isValid(viewid)
    || !mongoose.Types.ObjectId.isValid(viewerid)) {
    res.status(404).send('Event not found');
    return;
  }

  // TODO make sure only viewers can interview
  const e = await Event.findOneAndUpdate({
    _id: eventid, interviewees: { $elemMatch: { _id: viewid } },
  }, { $pull: { 'interviewees.$.interviewers': viewerid } });

  res.send(e);
};
