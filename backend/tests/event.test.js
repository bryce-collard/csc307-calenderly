const mongoose = require('mongoose');
const supertest = require('supertest');
const app = require('../server');

const request = supertest(app);
const User = require('../models/User');

const userData = new User({
  name: 'creator',
  email: 'test.user@gmail.com',
});

const eventData = {
  title: 'foo',
  description: 'bar',
  startDate: '2021-02-17T18:10:00.064Z',
  endDate: '2021-03-17T18:10:00.064Z',
  interviewersNeeded: 2,
  availabilityIncrement: 10,
};

describe('Test event endpoints', () => {
  let testUser;
  beforeAll(async () => {
    await mongoose.connect(process.env.DATABASE_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      useFindAndModify: false,
      useCreateIndex: true,
    }).then(() => console.log('Connected to MongoDB'));
    testUser = await userData.save(); // save a temporary user to reference as creator
    eventData.eventCreator = testUser._id.toString();
  });

  afterAll(async () => {
    await request.delete(`/users/${testUser._id}`);
    await mongoose.connection.close();
  });

  it('Create and delete event', async () => {
    const res = await request.post('/events').send(eventData);
    expect(res.body._id).toBeDefined();
    expect(res.body.title).toBe(eventData.title);
    expect(res.body.description).toBe(eventData.description);
    expect(res.body.startDate).toBe(eventData.startDate);
    expect(res.body.endDate).toBe(eventData.endDate);
    expect(res.body.interviewersNeeded).toBe(eventData.interviewersNeeded);
    expect(res.body.availabilityIncrement).toBe(eventData.availabilityIncrement);
    expect(res.body.interviewers[0].userId).toBe(eventData.eventCreator);

    // check that our created event exists in the creator's list of events
    const theCreator = await request.get(`/users/${testUser._id}`);
    expect(theCreator.body.events.some((eventid) => eventid === res.body._id)).toBe(true);

    const res1 = await request.delete(`/events/${res.body._id}`);
    expect(res1.status).toBe(204);
  });

  it('Get event by id', async () => {
    const res = await request.post('/events').send(eventData);

    const fetchedEvent = await request.get(`/events/${res.body._id}`);
    expect(JSON.stringify(fetchedEvent.body)).toBe(JSON.stringify(res.body));

    const res1 = await request.delete(`/events/${res.body._id}`);
    expect(res1.status).toBe(204);
  });

  it('Get all events', async () => {
    const savedEvent1 = await request.post('/events').send(eventData);
    const savedEvent2 = await request.post('/events').send(eventData);

    const fetchedEvents = await request.get('/events');
    expect(fetchedEvents.body.some((event) => event._id === savedEvent1.body._id)).toBe(true);
    expect(fetchedEvents.body.some((event) => event._id === savedEvent2.body._id)).toBe(true);

    const res1 = await request.delete(`/events/${savedEvent1.body._id}`);
    const res2 = await request.delete(`/events/${savedEvent2.body._id}`);
    expect(res1.status).toBe(204);
    expect(res2.status).toBe(204);
  });

  it('Get event interviewers', async () => {
    const res = await request.post('/events').send(eventData);

    const fetchedInterviewers = await request.get(`/events/${res.body._id}/interviewers`);
    expect(fetchedInterviewers.body[0].userId).toBe(eventData.eventCreator);

    const res1 = await request.delete(`/events/${res.body._id}`);
    expect(res1.status).toBe(204);
  });
});