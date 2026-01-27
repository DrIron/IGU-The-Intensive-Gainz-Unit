# Codebase Migration Guide: Lovable.dev to Local Development

## Overview

This codebase is a **React + TypeScript + Vite** application for **Intensive Gainz Unit Coaching** - an evidence-based online coaching platform with team programs and performance tracking. The application was originally built in Lovable.dev but has been migrated to run independently in a local development environment.

### Tech Stack

- **Frontend Framework**: React 19.2.3 with TypeScript
- **Build Tool**: Vite 5.4.19
- **Backend/Database**: Supabase (PostgreSQL + Auth + Edge Functions)
- **UI Framework**: shadcn-ui components built on Radix UI
- **Styling**: Tailwind CSS
- **Routing**: React Router DOM v6
- **State Management**: TanStack Query (React Query)
- **Form Handling**: React Hook Form + Zod validation
- **Charts**: Recharts
- **PDF Generation**: jsPDF

### Project Structure

```
intensive-gainz-unit-main/
├── src/
│   ├── components/          # React components
│   │   ├── admin/          # Admin dashboard components
│   │   ├── client/         # Client-facing components
│   │   ├── coach/          # Coach dashboard components
│   │   ├── nutrition/       # Nutrition tracking components
│   │   ├── onboarding/     # Onboarding flow components
│   │   ├── ui/             # shadcn-ui base components
│   │   └── ...
│   ├── pages/              # Route pages
│   │   ├── admin/          # Admin pages
│   │   ├── client/         # Client pages
│   │   ├── coach/          # Coach pages
│   │   └── ...
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Utility libraries
│   ├── integrations/       # External service integrations
│   │   └── supabase/       # Supabase client & types
│   └── utils/              # Helper functions
├── supabase/               # Supabase configuration
│   ├── functions/          # Edge Functions (Deno)
│   ├── migrations/         # Database migrations
│   └── config.toml         # Supabase project config
├── public/                 # Static assets
└── [config files]          # Vite, TypeScript, Tailwind, etc.
```

### Key Features

- **Multi-role Authentication**: Admin, Coach, and Client roles with role-based access control
- **Client Management**: Onboarding, progress tracking, workout sessions
- **Coach Dashboard**: Client management, nutrition tracking, session booking
- **Admin Dashboard**: System management, diagnostics, security tools
- **Payment Integration**: TAP Payments integration for subscriptions
- **Workout Library**: Exercise library and workout builder
- **Nutrition Tracking**: Body fat, weight, and nutrition goal tracking
- **Educational Videos**: Video content with progress tracking
- **Email Notifications**: Automated emails via Supabase Edge Functions
- **Airtable Integration**: Client data synchronization

---

## Step-by-Step Migration Instructions

### Step 1: Remove Lovable Dependencies

#### 1.1 Remove `lovable-tagger` from package.json

The `lovable-tagger` package is only used for development tooling in Lovable.dev and is not needed for local development.

**Action**: Remove the following line from `package.json`:
```json
"lovable-tagger": "^1.1.10",
```

#### 1.2 Update vite.config.ts

Remove the Lovable component tagger import and usage.

**Current code** (lines 4, 12):
```typescript
import { componentTagger } from "lovable-tagger";
// ...
plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
```

**Updated code**:
```typescript
// Remove the import line
// ...
plugins: [react()],
```

#### 1.3 Update README.md (Optional)

The README.md contains Lovable-specific instructions. You may want to update it with local development instructions, but this is optional.

---

### Step 2: Install Dependencies

Ensure you have Node.js installed (recommended: v18+ or v20+). Then install project dependencies:

```bash
npm install
```

This will install all required packages including React, Vite, Supabase client, and UI libraries.

---

### Step 3: Configure Environment Variables

The application requires Supabase configuration via environment variables.

#### 3.1 Check Existing .env File

The project includes a `.env` file with Supabase credentials:
- `VITE_SUPABASE_URL`: Your Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY`: Your Supabase anon/public key
- `VITE_SUPABASE_PROJECT_ID`: Your Supabase project ID

**Important**: 
- If you're using the existing Supabase project, these values should already be correct.
- If you need to set up a new Supabase project, see Step 4.

#### 3.2 Create .env.local (Optional)

For local development overrides, you can create a `.env.local` file (this is gitignored):
```bash
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_key
VITE_SUPABASE_PROJECT_ID=your_project_id
```

---

### Step 4: Supabase Setup

#### 4.1 Using Existing Supabase Project

If you're continuing with the existing Supabase project (`luobvdmetrfutavmbaha`):

1. Ensure you have access to the Supabase project dashboard
2. Verify the credentials in `.env` match your project
3. The database migrations are already in `supabase/migrations/` - they should be applied in your Supabase project

#### 4.2 Setting Up a New Supabase Project

If you need to create a new Supabase project:

1. **Create a Supabase project** at https://supabase.com
2. **Get your credentials**:
   - Project URL: `https://[project-ref].supabase.co`
   - Anon/Public Key: Found in Settings > API
   - Project ID: Found in Settings > General

3. **Apply database migrations**:
   ```bash
   # Install Supabase CLI (if not already installed)
   npm install -g supabase
   
   # Link to your project
   supabase link --project-ref your-project-ref
   
   # Apply migrations
   supabase db push
   ```

4. **Deploy Edge Functions** (if needed):
   ```bash
   supabase functions deploy [function-name]
   ```

5. **Update .env** with your new credentials

#### 4.3 Edge Functions Configuration

The project includes many Supabase Edge Functions in `supabase/functions/`. These handle:
- Payment processing (TAP Payments)
- Email notifications
- Airtable synchronization
- Session booking
- Account management
- And more...

**Note**: Edge Functions require additional environment variables in Supabase:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (for admin operations)
- Payment API keys (TAP Payments)
- Email service credentials
- Airtable API keys (if using Airtable integration)

Configure these in your Supabase project dashboard under Settings > Edge Functions > Secrets.

---

### Step 5: Start Development Server

Once dependencies are installed and environment variables are configured:

```bash
npm run dev
```

The development server will start on `http://localhost:8080` (configured in `vite.config.ts`).

You should see:
- Vite dev server running
- Hot module replacement (HMR) enabled
- Application accessible in browser

---

### Step 6: Verify Application

#### 6.1 Check Application Loads

1. Open `http://localhost:8080` in your browser
2. You should see the landing page (Index.tsx)
3. Check browser console for any errors

#### 6.2 Test Authentication

1. Navigate to `/auth` to test login/signup
2. Verify Supabase authentication is working
3. Check that user sessions persist

#### 6.3 Test Role-Based Access

The application has three main roles:
- **Admin**: Access to `/admin` routes
- **Coach**: Access to `/coach` routes  
- **Client**: Access to `/dashboard` and client-specific routes

Test that role-based routing works correctly.

---

### Step 7: Build for Production

To build the application for production:

```bash
npm run build
```

This creates an optimized production build in the `dist/` directory.

To preview the production build:

```bash
npm run preview
```

---

## Deployment Options

### Option 1: Vercel (Recommended)

The project includes `vercel.json` for Vercel deployment:

1. **Install Vercel CLI** (optional):
   ```bash
   npm install -g vercel
   ```

2. **Deploy**:
   ```bash
   vercel
   ```

3. **Configure Environment Variables** in Vercel dashboard:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_SUPABASE_PROJECT_ID`

### Option 2: Netlify

1. **Create `netlify.toml`**:
   ```toml
   [build]
     command = "npm run build"
     publish = "dist"
   
   [[redirects]]
     from = "/*"
     to = "/index.html"
     status = 200
   ```

2. **Deploy via Netlify CLI** or connect GitHub repo

### Option 3: Other Static Hosting

Any static hosting service that supports SPA routing:
- AWS S3 + CloudFront
- Cloudflare Pages
- GitHub Pages (with routing support)
- Any VPS with nginx

**Important**: Ensure your hosting service supports client-side routing (all routes should serve `index.html`).

---

## Troubleshooting

### Issue: "Cannot find module 'lovable-tagger'"

**Solution**: You haven't removed `lovable-tagger` from `vite.config.ts` or `package.json`. Follow Step 1.

### Issue: Supabase connection errors

**Solutions**:
- Verify `.env` file exists and has correct values
- Check that environment variables are prefixed with `VITE_` (required for Vite)
- Restart dev server after changing `.env`
- Verify Supabase project is active and credentials are correct

### Issue: Database/RLS errors

**Solutions**:
- Ensure all migrations have been applied to your Supabase project
- Check Row Level Security (RLS) policies are enabled
- Verify user roles are correctly assigned in `user_roles` table

### Issue: Edge Functions not working

**Solutions**:
- Verify Edge Functions are deployed to your Supabase project
- Check function secrets are configured in Supabase dashboard
- Review function logs in Supabase dashboard
- Ensure CORS headers are properly configured

### Issue: Build errors

**Solutions**:
- Clear `node_modules` and reinstall: `rm -rf node_modules package-lock.json && npm install`
- Check TypeScript errors: `npm run lint`
- Verify all dependencies are compatible with Node.js version

---

## Additional Configuration

### TypeScript Configuration

The project uses TypeScript with relaxed settings (see `tsconfig.json`). Type checking is configured in:
- `tsconfig.json` - Base configuration
- `tsconfig.app.json` - Application-specific config
- `tsconfig.node.json` - Node/build tool config

### ESLint Configuration

ESLint is configured in `eslint.config.js`. Run linting:
```bash
npm run lint
```

### Tailwind CSS

Tailwind is configured in `tailwind.config.ts`. The project uses:
- Custom color schemes
- shadcn-ui component styles
- Typography plugin

### Supabase Types

Database types are auto-generated in `src/integrations/supabase/types.ts`. To regenerate:
```bash
# If using Supabase CLI
supabase gen types typescript --local > src/integrations/supabase/types.ts
```

---

## Project-Specific Notes

### Authentication Flow

- Users sign up via `/auth`
- Onboarding flow at `/onboarding` (multi-step form)
- Role assignment happens during onboarding or admin creation
- Password reset at `/reset-password`

### Payment Integration

- TAP Payments integration for subscription management
- Payment webhooks handled by `supabase/functions/tap-webhook`
- Payment status tracking in `subscriptions` table

### Email System

- Email notifications sent via Supabase Edge Functions
- Functions use service role key for sending
- Email templates and logic in various edge functions

### Access Control

- Role-based access control (RBAC) implemented
- Protected routes use `ProtectedRoute` and `RoleProtectedRoute` components
- RLS policies enforce database-level security

---

## Next Steps

1. ✅ Remove Lovable dependencies (Step 1)
2. ✅ Install dependencies (Step 2)
3. ✅ Configure environment variables (Step 3)
4. ✅ Set up Supabase (Step 4)
5. ✅ Start development server (Step 5)
6. ✅ Verify application works (Step 6)
7. 🔄 Customize and extend as needed
8. 🚀 Deploy to production (Step 7)

---

## Support & Resources

- **Vite Documentation**: https://vitejs.dev
- **React Documentation**: https://react.dev
- **Supabase Documentation**: https://supabase.com/docs
- **shadcn-ui Documentation**: https://ui.shadcn.com
- **React Router Documentation**: https://reactrouter.com

---

## Summary

This migration removes the single Lovable dependency (`lovable-tagger`) and sets up the project for local development. The application is already well-structured and doesn't have deep Lovable integrations - it's a standard React + Vite + Supabase application that can run independently.

The main steps are:
1. Remove `lovable-tagger` from package.json and vite.config.ts
2. Install dependencies with `npm install`
3. Ensure `.env` has correct Supabase credentials
4. Run `npm run dev` to start development

The codebase is production-ready and can be deployed to any static hosting service that supports SPAs.
