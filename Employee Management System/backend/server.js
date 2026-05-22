const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const url = process.env.MONGO_URL || 'mongodb://mongodb:27017';
const dbName = 'emsDatabase';
let db;

async function initDB() {
    try {
        const client = await MongoClient.connect(url);
        db = client.db(dbName);
        console.log('✅ Connected to MongoDB Engine');
    } catch (err) {
        console.error('❌ DB connection error. Retrying...', err.message);
        setTimeout(initDB, 5000);
    }
}
initDB();

// 1. Auth Routing: Sign Up (Handles Email or Mobile Number)
app.post('/api/auth/signup', async (req, res) => {
    if (!db) return res.status(500).json({ error: 'Database service syncing' });
    const { identity, password, role } = req.body;
    
    const exist = await db.collection('users').findOne({ identity });
    if(exist) return res.status(400).json({ error: 'Account identity already registered' });

    await db.collection('users').insertOne({ identity, password, role: role || 'Employee' });
    res.status(201).json({ message: 'User registered successfully!' });
});

// 2. Auth Routing: Login Control
app.post('/api/auth/login', async (req, res) => {
    const { identity, password } = req.body;
    const user = await db.collection('users').findOne({ identity, password });
    if(!user) return res.status(401).json({ error: 'Wrong identity or password' });
    res.json({ identity: user.identity, role: user.role });
});

// 3. Admin Control: Add Employee Record
app.post('/api/employees', async (req, res) => {
    const { name, email, mobile, dept, designation, salary } = req.body;
    const data = { name, email, mobile, dept, designation, baseSalary: parseFloat(salary || 0) };
    const result = await db.collection('employees').insertOne(data);
    res.status(201).json(result);
});

// 4. Admin/Employee Control: Fetch Employee Directory
app.get('/api/employees', async (req, res) => {
    const data = await db.collection('employees').find({}).toArray();
    res.json(data);
});

// 5. Admin Control: Update Employee Details
app.put('/api/employees/:id', async (req, res) => {
    const { id } = req.params;
    const { name, dept, designation, salary } = req.body;
    await db.collection('employees').updateOne(
        { _id: new ObjectId(id) },
        { $set: { name, dept, designation, baseSalary: parseFloat(salary) } }
    );
    res.json({ message: 'Update executed' });
});

// 6. Admin Control: Delete Employee from Database
app.delete('/api/employees/:id', async (req, res) => {
    const { id } = req.params;
    await db.collection('employees').deleteOne({ _id: new ObjectId(id) });
    res.json({ message: 'Deletion executed' });
});

// 7. PAYROLL: Salary calculate karna aur save karna (Updated to map via Email/Identity)
app.post('/api/salaries', async (req, res) => {
    const { empId, empName, month, allowances, deductions, base } = req.body;
    const net = (parseFloat(base) + parseFloat(allowances || 0)) - parseFloat(deductions || 0);
    
    // Pehle database se us employee ki registered email/identity nikalenge
    const empData = await db.collection('employees').findOne({ _id: new ObjectId(empId) });
    
    const payslip = { 
        empId, 
        empName, 
        empIdentity: empData ? empData.email : empName, // Email ID map kar rahe hain tracking ke liye
        month, 
        totalPayout: net, 
        timestamp: new Date() 
    };
    await db.collection('payouts').insertOne(payslip);
    res.status(201).json({ message: 'Payroll Disbursed', amount: net });
});

// 8. LEDGER: Employee ko uski purani salary slips dikhana (Updated to search via Identity)
app.get('/api/salaries/:identity', async (req, res) => {
    // Ab query database me email/identity field par match karegi
    const history = await db.collection('payouts').find({ empIdentity: req.params.identity }).toArray();
    res.json(history);
});

app.listen(5000, '0.0.0.0', () => console.log('🚀 API Microservice active on port 5000'));
