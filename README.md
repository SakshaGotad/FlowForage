# 🚀 FlowForage

A scalable, queue-based workflow automation engine built using **NestJS**, **BullMQ**, **PostgreSQL**, and **Redis**. This project is inspired by systems like Zapier and AWS EventBridge, enabling asynchronous event-driven workflows.

---

## 📌 Features

* ⚡ Event-driven workflow execution
* 🔁 Retry & failure handling
* 🧵 Queue-based async processing using BullMQ
* 🗄️ Persistent workflow state with PostgreSQL
* 🧩 Pluggable workflow steps
* 📡 Scalable worker architecture

---

## 🏗️ Architecture Overview

```
Client → API (NestJS) → Workflow Engine → Queue (BullMQ + Redis) → Worker → Execution → DB (Postgres)
```

---

## 🛠️ Tech Stack

* **Backend:** NestJS (Node.js)
* **Queue:** BullMQ
* **Database:** PostgreSQL
* **Cache/Queue Broker:** Redis
* **ORM/Query:** pg (or TypeORM/Prisma optional)

---

## 📂 Project Structure

```
src/
 ├── engine/           # Core workflow engine
 ├── workflows/       # Workflow definitions
 ├── queue/           # BullMQ setup
 ├── workers/         # Worker processors
 ├── db/              # Database connection & queries
 ├── modules/         # NestJS modules
 └── main.ts
```

---

## ⚙️ Setup Instructions

### 1️⃣ Clone Repository

```bash
git clone https://github.com/your-username/eventbridge-engine.git
cd eventbridge-engine
```

### 2️⃣ Install Dependencies

```bash
npm install
```

### 3️⃣ Start Services (Docker)

```bash
docker-compose up -d
```

Services included:

* PostgreSQL
* Redis

### 4️⃣ Run Application

```bash
npm run start:dev
```

---

## 🧠 How It Works

### 1. Create Workflow Run

```ts
await engine.create(workflowName, payload);
```

* Stores workflow in DB
* Marks status as `running`

### 2. Push to Queue

Workflow execution is added to BullMQ queue.

### 3. Worker Processes Job

* Picks job from queue
* Executes steps
* Updates DB status

### 4. Retry Logic

* Failed jobs are retried automatically
* Configurable retry attempts

---

## 🔄 Workflow Lifecycle

```
running → success
        → failed → retry → success
```

---

## 📊 Database Schema (Example)

```sql
CREATE TABLE eventbridge_workflow_runs (
  id SERIAL PRIMARY KEY,
  workflow_name TEXT,
  status TEXT,
  payload JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 📦 Example Workflow

```ts
export const sampleWorkflow = async (payload) => {
  console.log('Step 1');
  console.log('Step 2');
};
```

---

## 🚀 Future Improvements

* UI Dashboard for workflow monitoring
* Webhook triggers
* Kafka integration for event streaming
* Distributed workers (Kubernetes)
* Workflow builder UI (drag & drop)

---

## 🤝 Contributing

1. Fork the repo
2. Create a new branch
3. Make changes
4. Submit PR

---

## 📄 License

MIT License


