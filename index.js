const express = require('express');
const cors = require('cors');
require('dotenv').config()
const jwt = require('jsonwebtoken')
const stripe = require('stripe')(process.env.STRYP_SECRET_KEY)
const moment = require('moment');


const app = express();
const port = process.env.PORT | 5000;

// middleWare
app.use(
    cors({
        origin: ['http://localhost:5173', 'https://enmmedia.web.app'],
    }),
)
app.use(express.json())



const { MongoClient, ServerApiVersion } = require('mongodb');
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

        const db = await client.db('SurveyWave');
        const usersDataCollection = db.collection('usersData');

        // Jwt api
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
            res.send({ token })

        })

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

        app.post('/check-role', async (req, res) => {
            const user = await req.body;
            const query = { email: user.email }

            const role = await usersDataCollection.findOne(query);
            const setRole = await role?.role;
            res.send({ role: setRole })
        })

        // await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
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