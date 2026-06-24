# Marks Tracker Trial Deployment

## Environment Variables

### Backend

Configure these variables in the backend hosting environment:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public
JWT_SECRET=replace-with-a-long-random-production-secret
FRONTEND_URL=https://your-frontend.vercel.app
```

`PORT` is supplied automatically by Render. The application falls back to
`3000` locally. `JWT_EXPIRES_IN` is optional and defaults to `1d`.

### Frontend

Configure this variable in Vercel:

```env
VITE_API_URL=https://your-backend.onrender.com/api
```

The frontend falls back to `http://localhost:3000/api` for local development.

## Database Deployment

Run production migrations with:

```bash
npx prisma migrate deploy
```

Seed initial data only when needed:

```bash
npx prisma db seed
```

Do not use `prisma migrate dev` against a production database.

## Render Backend

1. Create a PostgreSQL database and copy its connection URL.
2. Create a Render Web Service connected to this repository.
3. Set the service root directory to `backend`.
4. Use this build command:

   ```bash
   npm ci && npm run prisma:generate && npm run build
   ```

5. Use this start command:

   ```bash
   npm run start:prod
   ```

6. Add `DATABASE_URL`, `JWT_SECRET`, and `FRONTEND_URL` in Render.
7. Before starting the new release, run:

   ```bash
   npx prisma migrate deploy
   ```

8. For the first trial deployment only, open the Render Shell and run:

   ```bash
   npx prisma db seed
   ```

9. After Vercel provides the final frontend URL, set `FRONTEND_URL` to that
   exact origin, without a path.

## Vercel Frontend

1. Create a Vercel project connected to this repository.
2. Set the project root directory to `frontend`.
3. Select the Vite framework preset.
4. Keep the build command as:

   ```bash
   npm run build
   ```

5. Keep the output directory as `dist`.
6. Add `VITE_API_URL` with the Render backend URL ending in `/api`.
7. Deploy the project.
8. Copy the deployed Vercel origin into the backend `FRONTEND_URL` variable
   and redeploy the backend.

The included `frontend/vercel.json` routes direct visits such as `/dashboard`
and `/scores` back to the React application.
