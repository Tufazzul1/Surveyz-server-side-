const express = require('express');
require('dotenv').config();
const app = express();
const jwt = require('jsonwebtoken')
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;


// middleware
app.use(cors({
    origin: ["http://localhost:5173",
        "https://surveyz-17ed8.firebaseapp.com",
        "https://surveyz-17ed8.web.app"]
}));
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.6qre6yi.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        const usersCollection = client.db('Serveyz').collection('users');
        const surveysCollection = client.db('Serveyz').collection('surveys');
        const paymentsCollection = client.db('Serveyz').collection('payments');
        const reportsCollection = client.db("Serveyz").collection("reports");
        const votesCollection = client.db("Serveyz").collection("votes");



        // jwt related api 
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1d' })
            res.send({ token })
        })

        // middlewares jwt 
        const verifyToken = (req, res, next) => {
            // console.log("inside verify token", req.headers.authorization);
            if (!req.headers.authorization) {
                return res.status(401).send({ message: "unauthorized access" })
            }
            const token = req.headers.authorization.split(' ')[1];
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'unauthorized access' })
                }
                req.decoded = decoded;
                next();
            })
        }

        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email }
            const user = await usersCollection.findOne(query)
            const isAdmin = user?.role === "admin";
            if (!isAdmin) {
                return res.status(403).send({ message: "fobidden access" })
            }
            next();
        }

        // users related api ---------------------

        app.get('/users/admin/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            const query = { email: email }
            const user = await usersCollection.findOne(query)
            let admin = false;
            if (user) {
                admin = user?.role === "admin"
            }
            res.send({ admin })
        });

        app.get('/users/surveyor/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            if (email !== req.decoded.email) {
                res.status(403).send({ message: 'forbiden access access' })
            }
            const query = { email: email }
            const user = await usersCollection.findOne(query)
            let surveyor = false;
            if (user) {
                surveyor = user?.role === "surveyor"
            }
            res.send({ surveyor })
        });
        app.get('/users/prouser/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            if (email !== req.decoded.email) {
                res.status(403).send({ message: 'forbidden access access' })
            }
            const query = { email: email }
            const user = await usersCollection.findOne(query)
            let proUser = false;
            if (user) {
                proUser = user?.role === "pro-user"
            }
            res.send({ proUser })
        });
        app.get('/users/user/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            if (email !== req.decoded.email) {
                res.status(403).send({ message: 'forbidden access access' })
            }
            const query = { email: email }
            const user = await usersCollection.findOne(query)
            let User = false;
            if (user) {
                User = user?.role === "user"
            }
            res.send({ User })
        });


        app.put('/users', async (req, res) => {
            const user = req.body;

            const options = { upsert: true };
            const query = { email: user.email };
            const existingUser = await usersCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: "user already exist", insertedId: null })
            }
            const updatedDoc = {
                $set: {
                    ...user
                }
            }
            const result = await usersCollection.updateOne(query, updatedDoc, options);
            res.send(result);
        });

        app.get('/users', async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result);
        });

        app.patch('/users/role/:id', async (req, res) => {
            const id = req.params.id;
            const { role } = req.body;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    role: role
                }
            };
            const result = await usersCollection.updateOne(filter, updatedDoc);
            res.send(result);
        });

        app.delete('/users/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await usersCollection.deleteOne(query);
            res.send(result);
        });

        app.post('/reports', async (req, res) => {
            try {
                const data = req.body;
                const result = await reportsCollection.insertOne(data);
                res.send(result);
            } catch (error) {
                console.error('Error saving survey:', error);
                res.status(500).send({ error: 'Internal Server Error' });
            }
        });

        // for vote methods
        app.get('/reports', async (req, res) => {
            const result = await reportsCollection.find().toArray();
            res.send(result);
        });

        // email method on data get
        app.get('/reported/:email', async (req, res) => {
            const userEmails = req.params.email
            const result = await reportsCollection.find({ userEmail: userEmails }).toArray();
            res.send(result);
        });

        // for single vote data
        app.get('/report/:id', verifyToken, async (req, res) => {
            if (req.user.email) {
                const id = req.params.id;
                const query = { _id: new ObjectId(id) };
                const result = await reportsCollection.findOne(query);
                res.send(result);
            }
        });

        // update vote count
        app.post('/votes', async (req, res) => {
            const voteSurvey = req.body;
            const voteId = voteSurvey.voteId;
            const result = await votesCollection.insertOne(voteSurvey);
            const updateDoc = {
                $inc: { voteCount: 1 },
            }
            const voteQuery = { _id: new ObjectId(voteId) }
            const updateVoteCount = await surveysCollection.updateOne(voteQuery, updateDoc)

            res.send(result);
        });


        // survey related api ---------------------------------

        app.post('/surveys', async (req, res) => {
            try {
                const data = req.body;
                const result = await surveysCollection.insertOne(data);
                res.send(result);
            } catch (error) {
                console.error('Error saving survey:', error);
                res.status(500).send({ error: 'Internal Server Error' });
            }
        });
        // get single survey data from db using _id
        app.get('/surveyDetails/:id', async (req, res) => {
            try {
                const id = req.params.id;
                const query = { _id: new ObjectId(id) }
                const result = await surveysCollection.findOne(query);
                res.send(result);
            } catch (error) {
                console.error('Error fetching surveys:', error);
                res.status(500).send({ error: 'Internal Server Error' });
            }
        });

        app.get('/all-surveys', async (req, res) => {
            const size = parseInt(req.query.size) || 10;
            const page = parseInt(req.query.page) || 1;
            const filter = req.query.filter;
            const sort = req.query.sort;
            const search = req.query.search;

            // Build the query object
            let query = search ? { title: { $regex: search, $options: 'i' } } : {};
            if (filter) query.category = filter;

            // Build the sort options
            let sortOptions = {};
            if (sort) sortOptions.voteCount = sort === 'asc' ? 1 : -1;

            try {
                // Fetch surveys and total count
                const [surveys, totalCount] = await Promise.all([
                    surveysCollection.find(query).sort(sortOptions).skip((page - 1) * size).limit(size).toArray(),
                    surveysCollection.countDocuments(query)
                ]);

                res.send({ surveys, totalCount });
            } catch (error) {
                console.error('Error fetching surveys:', error);
                res.status(500).send({ error: 'Internal Server Error' });
            }
        });

        app.get('/allSurveys', async (req, res) => {
            const result = await surveysCollection.find().toArray();
            res.send(result);
        });
        // update status 
        app.put('/surveys/:id/status', async (req, res) => {
            const { id } = req.params;
            const { status, feedback } = req.body;
            try {
                await surveysCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { status, feedback } }
                );
                res.status(200).send({ message: 'Survey status updated successfully' });
            } catch (error) {
                console.error('Failed to update survey status', error);
                res.status(500).send({ error: 'Failed to update survey status' });
            }
        });

        // Get all surveys data count from db
        app.get('/surveys-count', async (req, res) => {
            const filter = req.query.filter;
            const search = req.query.search;

            // Build the query object
            let query = search ? { title: { $regex: search, $options: 'i' } } : {};
            if (filter) query.category = filter;

            try {
                const count = await surveysCollection.countDocuments(query);
                res.send({ count });
            } catch (error) {
                console.error('Error fetching survey count:', error);
                res.status(500).send({ error: 'Internal Server Error' });
            }
        });



        //   payment realted api ------------------------------

        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);
            // console.log(amount)

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: ['card']
            })
            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        })

        app.get('/payments/:email', verifyToken, async (req, res) => {
            const query = { email: req.params.email };
            if (req.params.email !== req.decoded.email) {
                return res.status(403).send({ message: "forbidden access" })
            }
            const result = await paymentsCollection.find(query).toArray();
            res.send(result)
        })
        app.post('/payments', async (req, res) => {
            const payment = req.body;

            try {
                const paymentResult = await paymentsCollection.insertOne(payment);
                console.log("Payment Info", payment);
                const userUpdateResult = await usersCollection.updateOne(
                    { email: payment?.email },
                    {
                        $set: { role: 'pro-user' }
                    }
                );

                res.send({ paymentResult, userUpdateResult });
            } catch (error) {
                console.error('Error processing payment:', error);
                res.status(500).send({ message: 'Internal server error' });
            }
        });
        // get payments 
        app.get('/payments', async (req, res) => {
            const result = await paymentsCollection.find().toArray();
            res.send(result);
        });



        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);



app.get('/', (req, res) => {
    res.send("Serveyz server is running")
})

app.listen(port, () => {
    console.log(`Server is running on port ${port}`)
})