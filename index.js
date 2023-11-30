const express = require('express');
const cors = require('cors');
require('dotenv').config()
const jwt = require('jsonwebtoken')
const stripe = require('stripe')(process.env.STRYP_SECRET_KEY)
const moment = require('moment-timezone');



const app = express();
const port = process.env.PORT | 5000;

// middleWare
app.use(
    cors({
        origin: ['http://localhost:5173', 'https://enmmedia.web.app'],
    }),
)
app.use(express.json())



const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.ziw2dg7.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {

        await client.connect();
        // Db collections
        const db = await client.db('SurveyWave');
        const usersDataCollection = db.collection('usersData');
        const surveyDataCollection = db.collection('allSurveys');
        const paymentDataCollection = db.collection('payments')
        // Jwt api
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
            res.send({ token })

        })


        // jwt middleware for check token
        const tokenVerify = (req, res, next) => {
            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'Forbidden access' })
            }
            const token = req.headers.authorization.split(' ')[1]
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'Unauthorized user' })
                }
                req.decoded = decoded
                // console.log(req.decoded)
                next();
            })
        }

        // After verify token verify the admin
        const adminVerify = async (req, res, next) => {
            const email = req.decoded.email
            const query = { email: email }
            const user = await usersDataCollection.findOne(query);
            if (user?.role !== 'admin') {
                return res.status(401).send({ message: 'Unauthorized access' })
            }
            next()
        }
        const surveyorVerify = async (req, res, next) => {
            const email = req.decoded.email
            const query = { email: email }
            const user = await usersDataCollection.findOne(query);
            if (user?.role !== 'surveyor') {
                return res.status(401).send({ message: 'Unauthorized access' })
            }
            next()
        }

        const proVerify = async (req, res, next) => {
            const email = req.decoded.email
            const query = { email: email }
            const user = await usersDataCollection.findOne(query);
            if (user?.role !== 'pro') {
                return res.status(401).send({ message: 'Unauthorized access' })
            }
            next()
        }



        const adminSurveyorVerify = async (req, res, next) => {
            if (tokenVerify || adminVerify || surveyorVerify) {
                next()
            }
        }
        const adminProSurveyorVerify = async (req, res, next) => {
            if (tokenVerify || adminVerify || surveyorVerify || proVerify) {
                next()
            }
        }


        // Creating new user
        app.post('/newUser', async (req, res) => {
            const userData = req.body;
            const query = {
                email: userData.email
            }
            const existUser = await usersDataCollection.findOne(query);

            if (existUser?.email === userData.email) {
                return
            }
            const result = await usersDataCollection.insertOne(userData);
            return res.send(result);

        })

        app.post('/allUsers', tokenVerify, adminVerify, async (req, res) => {
            const filter = req.body;
            // console.log(filter)
            if (filter.role === 'allUsers') {
                const result = await usersDataCollection.find().toArray()
                return res.send(result);

            } else {
                const query = {
                    role: filter.role
                }
                const result = await usersDataCollection.find(query).toArray()
                // console.log(result)
                return res.send(result);
            }

        })
        app.get('/all-user', tokenVerify, adminSurveyorVerify, async (req, res) => {
            const result = await usersDataCollection.find().toArray()
            // console.log(result)
            return res.send(result);
        }
        )

        // Delete User
        app.delete('/deleteUser', tokenVerify, adminVerify, async (req, res) => {
            const id = req.query.userId;
            const query = { _id: new ObjectId(id) }
            const result = await usersDataCollection.deleteOne(query);
            res.send(result)
        })

        // Payment Intent 
        app.post('/create-payment-intent', async (req, res) => {
            const price = req.body;
            const amount = parseFloat(price.amount) * 100;

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            })
            res.send({
                paymentIntent: paymentIntent.client_secret
            })
        })

        // Pro user buying api
        app.patch('/buyPro', async (req, res) => {
            const data = req.body;
            const filter = { email: data.email }
            const option = { upsert: true }
            const update = {
                $set: {
                    role: data.role
                }
            }
            const result = await usersDataCollection.updateOne(filter, update, option)
            res.send(result);
        })

        //  Paid user data api
        app.post('/paidUsers', async (req, res) => {
            const data = req.body
            const result = await paymentDataCollection.insertOne(data);
            res.status(200).send(result)
        })

        app.get('/getPaidUsers', tokenVerify, adminVerify, async (req, res) => {
            const result = await paymentDataCollection.find().toArray();
            res.send(result)
        })


        // Check user role
        app.get('/check-role/:email', async (req, res) => {
            const email = await req.params.email;
            const query = { email: email }
            const user = await usersDataCollection.findOne(query);
            res.send({ role: user.role })
        })

        // Check user role
        // app.get('/check-role/:email', async (req, res) => {
        //     const email = await req.params.email;
        //     // console.log(req.decoded)
        //     if (email !== req.decoded.email) {
        //         return res.status(401).send({ message: 'Unauthorized user' })
        //     }
        //     const query = { email: email }

        //     const user = await usersDataCollection.findOne(query);
        //     res.send({ role: user.role })
        // })

        // Admin make action api
        app.put('/changeRole', tokenVerify, adminVerify, async (req, res) => {
            const role = req.body;
            const id = role.id;
            const query = { _id: new ObjectId(id) }
            const update = { $set: { role: role.role } }
            const result = await usersDataCollection.updateOne(query, update, { upsert: true })
            res.send(result)
        })

        // survey post api
        app.post('/postSurvey', tokenVerify, adminSurveyorVerify, async (req, res) => {
            const survey = req.body;

            const timezone = req.body.timezone || 'UTC'
            survey.publishedDate = moment.tz(timezone).format()
            const deadlineDate = req.body.deadline
            const parsedDate = moment(deadlineDate, 'YYYY/MM/DD');
            const utcDate = parsedDate.utc();
            survey.deadline = utcDate.format();
            const postSurvey = await surveyDataCollection.insertOne(survey);
            res.send(postSurvey);
        })


        // Update survey
        app.patch('/updateSurvey/:id', tokenVerify, adminSurveyorVerify, async (req, res) => {
            const id = req.params.id;
            const updateData = req.body;
            const query = { _id: new ObjectId(id) }
            const deadlineDate = req.body.deadline
            const parsedDate = moment(deadlineDate, 'YYYY/MM/DD');
            const utcDate = parsedDate.utc();
            const update = {
                $set: {
                    title: updateData.title,
                    body: updateData.body,
                    category: updateData.category,
                    deadline: utcDate.format()
                }
            }
            const updateSurvey = await surveyDataCollection.updateOne(query, update, { upsert: true })
            res.send(updateSurvey);
        })

        // Delete Survey
        app.patch('/reportSurvey/:id', tokenVerify, adminVerify, async (req, res) => {
            const id = req.params.id;
            const updateData = req.body;
            const query = { _id: new ObjectId(id) }
            const update = {
                $set: {
                    adminComment: updateData.adminComment,
                    publish: updateData.status === 'false' ? false : true,
                }
            }
            const result = await surveyDataCollection.updateOne(query, update, { upsert: true });
            res.send(result)
        })
        app.delete('/deleteSurvey/:id', tokenVerify, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await surveyDataCollection.deleteOne(query);
            res.send(result)
        })

        // Get all posted surveys
        app.get('/surveys', async (req, res) => {
            const query = { publish: true }
            const result = await surveyDataCollection.find(query).toArray();
            res.send(result);
        })
        app.get('/allAdminSurveys', tokenVerify, adminVerify, async (req, res) => {
            const result = await surveyDataCollection.find().toArray();
            res.send(result);
        })

        app.get('/surveys/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await surveyDataCollection.findOne(query)
            res.send(result);
        })

        app.get('/specificSurvey/:email', tokenVerify, async (req, res) => {
            const email = req.params.email;
            const query = { surveyor: email }
            const result = await surveyDataCollection.find(query).toArray()
            res.send(result);
        })

        // Voting api
        app.put('/addVote/:id', tokenVerify, async (req, res) => {
            const id = req.params.id
            const addVote = req.body
            const query = { _id: new ObjectId(id) }
            if (addVote.vote === 'Yes') {
                const update = {
                    $push: {
                        totalTrueVote: addVote.user
                    }
                }
                const result = await surveyDataCollection.updateOne(query, update)
                res.send(result)
            }
            if (addVote.vote === 'No') {
                const update = {
                    $push: {
                        totalFalseVote: addVote.user
                    }
                }
                const result = await surveyDataCollection.updateOne(query, update)
                res.send(result)
            }
            // const result = await surveyDataCollection.updateOne(query)
            // res.send(query)
        })
        // like related api
        app.put('/addLike/:id', tokenVerify, async (req, res) => {
            const id = req.params.id
            const addLike = req.body
            const query = { _id: new ObjectId(id) }
            const update = {
                $push: {
                    totalLike: addLike.user
                }
            }
            const result = await surveyDataCollection.updateOne(query, update)
            res.send(result)

            // const result = await surveyDataCollection.updateOne(query)
            // res.send(query)
        })
        app.put('/disLike/:id', tokenVerify, async (req, res) => {
            const id = req.params.id
            const addLike = req.body
            const query = { _id: new ObjectId(id) }
            const update = {
                $push: {
                    totalDisLike: addLike.user
                }
            }
            const result = await surveyDataCollection.updateOne(query, update)
            res.send(result)

            // const result = await surveyDataCollection.updateOne(query)
            // res.send(query)
        })

        app.post('/comments/:id', tokenVerify, adminProSurveyorVerify, async (req, res) => {
            const comment = req.body
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const update = {
                $push: {
                    totalComments: comment
                }
            }
            const result = await surveyDataCollection.updateOne(query, update)
            res.send(result)
        })

        app.post('/report/:id', async (req, res) => {
            const report = req.body
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const update = {
                $push: {
                    report: report
                }
            }
            const result = await surveyDataCollection.updateOne(query, update)

            res.send(result)
        })


        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/status', (req, res) => {
    res.send("Server is running.");
})

app.listen(port, () => {
    console.log(`Server is running on port: ${port}`)
})