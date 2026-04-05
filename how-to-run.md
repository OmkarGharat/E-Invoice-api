## Setup Instructions

This is a **Node.js project** (Express-based API). Here's what you need:

### Prerequisites

- **Node.js** >= 16.0.0 (required per package.json)

### Installation Steps

1. **Install npm dependencies:**

   ```bash
   npm install
   ```

2. **Start the server:**
   ```bash
   npm start
   ```
   The server will run on port 3000 (see server.js for configuration)

### Available Commands

| Command                 | Purpose                         |
| ----------------------- | ------------------------------- |
| `npm start`             | Start the Express server        |
| `npm test`              | Run all tests (Jest with retry) |
| `npm run test:smoke`    | Run smoke tests                 |
| `npm run test:sanity`   | Run sanity tests                |
| `npm run test:security` | Run security tests              |

### Dependencies Installed

- **express** - Web framework
- **cors** - CORS handling
- **express-xml-bodyparser** - XML parsing
- **xml-js** - XML/JSON conversion
- **jest** - Testing framework
- **supertest** - HTTP testing
- **jest-html-reporter** - Test reporting

### Key Points

- This is a **testing API only** for Indian E-Invoicing system (not production-ready)
- No Python/pip required—it's purely JavaScript/Node.js
- Tests generate an HTML report in test-report.html
- Health check and full documentation available at `http://localhost:3000`

**Ready to go?** Just run `npm install` then `npm start`! 🚀
