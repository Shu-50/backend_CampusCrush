# Campus Crush Backend

## Setup Instructions

### 1. Environment Variables
```bash
# Copy the example environment file
cp .env.example .env

# Edit the .env file with your actual credentials
nano .env  # or use your preferred editor
```

### 2. Required Services

#### MongoDB
- Install MongoDB locally or use MongoDB Atlas
- Default connection: `mongodb://127.0.0.1:27017/campus_crush`

#### Cloudinary (Image Storage)
1. Sign up at [Cloudinary](https://cloudinary.com/)
2. Get your credentials from the dashboard
3. Add them to your `.env` file:
   ```
   CLOUDINARY_CLOUD_NAME=your-cloud-name
   CLOUDINARY_API_KEY=your-api-key
   CLOUDINARY_API_SECRET=your-api-secret
   ```

### 3. Installation & Running
```bash
# Install dependencies
npm install

# Start the development server
npm run dev

# Or start normally
npm start
```

### 4. Security Notes
- **Never commit your `.env` file** - it contains sensitive API keys
- The `.env` file is already in `.gitignore`
- Use strong, unique passwords and secrets
- Rotate your API keys regularly

### 5. API Endpoints
The server runs on `http://localhost:5001` by default.

Main endpoints:
- `GET /api/health` - Health check
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/users/profile` - Get user profile
- And more...

### 6. Database Schema
The app uses MongoDB with Mongoose ODM. Models are in the `/models` directory.

### 7. Troubleshooting
- Make sure MongoDB is running
- Check that all environment variables are set correctly
- Verify Cloudinary credentials are valid
- Check the console for error messages