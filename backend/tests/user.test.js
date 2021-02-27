const mongoose = require('mongoose');
const supertest = require('supertest');
const app = require('../server');

const request = supertest(app);
const User = require('../models/User');

const userData = new User({
  email: 'test.user@gmail.com',
  name: 'Test User',
  picture: 'pictureString',
  googleId: 'googleIdString',
  secret: 'secretString',
});

const eventData = {
  title: 'foo',
  description: 'bar',
  startDate: '2021-02-17T18:10:00.064Z',
  endDate: '2021-03-17T18:10:00.064Z',
  interviewersNeeded: 2,
  availabilityIncrement: 10,
};

describe('Test user endpoints', () => {
  let testUser;
  beforeAll(async () => {
    await mongoose.connect(process.env.DATABASE_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      useFindAndModify: false,
      useCreateIndex: true,
    }).then(() => console.log('Connected to MongoDB'));
    testUser = await userData.save(); // no createUser endpoint to test, so we'll make one here
    eventData.eventCreator = testUser._id.toString();
  });

  afterAll(async () => {
    await request.delete(`/users/${testUser._id}`);
    await mongoose.connection.close();
  });

  it('Get user, get users, delete user', async () => {
    // Test get user
    const user1 = (await request.get(`/users/${testUser._id}`)).body;
    expect(JSON.stringify(user1)).toBe(JSON.stringify(testUser));

    // make a second temporary user so getUsers is meaningful and
    // we have a user to delete
    const testUser2 = await new User({
      email: 'test.user2@gmail.com',
      name: 'Test User 2',
    }).save();
    const users = (await request.get('/users')).body;
    expect(users.some((user) => user._id.toString() === testUser._id.toString())).toBe(true);
    expect(users.some((user) => user._id.toString() === testUser2._id.toString())).toBe(true);

    // make sure testUser2 is deleted successfully
    const res = await request.delete(`/users/${testUser2._id}`);
    expect(res.status).toBe(204);
  });

  it('Get user events', async () => {
    // create event (testUser is creator)
    const theEvent = (await request.post('/events').send(eventData)).body;

    // make a new user and add to the event
    const newInterviewer = await new User({
      name: 'new interviewer',
      email: 'new.interviewer@gmail.com',
    }).save();
    const postMessage = (await request.post(`/events/${theEvent._id}/interviewers`).send({ userId: newInterviewer._id })).text;
    expect(postMessage).toBe('1 user(s) added successfully');

    // make sure the event is in testUser's and newInterviewer's events[]
    // get latest
    const testUserEvents = (await request.get(`/users/${testUser._id}/events`)).body;
    const newInterviewerEvents = (await request.get(`/users/${newInterviewer._id}/events`)).body;
    // check
    expect(testUserEvents.some((eventId) => eventId === theEvent._id.toString())).toBe(true);
    expect(newInterviewerEvents.some((eventId) => eventId === theEvent._id.toString())).toBe(true);

    // delete newInterviewer
    const res = await request.delete(`/users/${newInterviewer._id}`);
    expect(res.status).toBe(204);

    // delete theEvent
    const res2 = await request.delete(`/events/${theEvent._id}`);
    expect(res2.status).toBe(204);
  });
});
