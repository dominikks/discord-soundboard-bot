# GitHub Copilot Instructions

This document provides guidance for GitHub Copilot when working with the Discord Soundboard Bot codebase.

## Project Overview

This is a Discord soundboard bot that allows users to play custom sounds in voice channels and record voice activity. The project consists of:
- **Backend**: Rust-based API server using Rocket web framework, Serenity for Discord integration, and Diesel ORM for PostgreSQL
- **Frontend**: Angular application with Material Design components

## Technology Stack

### Backend (Rust)
- **Web Framework**: Rocket 0.5.1
- **Discord Integration**: Serenity 0.12, Songbird 0.5
- **Database**: Diesel 2.2 with PostgreSQL
- **Audio Processing**: Symphonia
- **Authentication**: OAuth2

### Frontend (TypeScript/Angular)
- **Framework**: Angular 21
- **UI Components**: Angular Material 21
- **Build Tool**: Angular CLI
- **Testing**: Jasmine, Karma

## Build and Development Commands

### Backend (from `backend/` directory)
- **Build**: `cargo build`
- **Run**: `cargo run` (requires `.env` file with credentials)
- **Format**: `cargo fmt`
- **Lint**: `cargo clippy`

### Frontend (from `frontend/` directory)
- **Install dependencies**: `npm ci`
- **Development server**: `npm start` (runs on http://localhost:4200)
- **Build**: `npm run build`
- **Test**: `npm run test`
- **Lint**: `npm run lint`
- **Format**: `npm run format`
- **Format check**: `npm run format:check`

### Development Environment
- Start PostgreSQL database: `docker compose up -d` (from project root)
- Database runs on port 5432
- Adminer (DB admin tool) runs on port 8080

## Code Style and Formatting

### Rust Backend
- Use `rustfmt` for formatting (enforced in CI)
- Follow Clippy recommendations
- Use idiomatic Rust patterns
- Maintain existing module structure (api, audio_utils, db, discord, file_handling)

### TypeScript/Angular Frontend
- **Indentation**: 2 spaces
- **Quotes**: Single quotes for strings
- **Line length**: Prettier formats at 120 characters; ESLint allows up to 140 characters
- **Import order**: Enforced via ESLint
- **Component selectors**: Use `app-` prefix with kebab-case
- **Directive selectors**: Use `app` prefix with camelCase
- **Change Detection**: Use `ChangeDetectionStrategy.OnPush` where possible
- **Unused variables**: Prefix with underscore (`_`) to ignore
- **Member ordering**: Static fields/methods first, then instance fields, constructor, methods

### Formatting Tools
- Frontend uses Prettier (configuration in `.prettierrc`)
- Frontend uses ESLint (configuration in `.eslintrc.json`)
- Backend uses cargo fmt
- Always run formatters before committing

## Project Structure

### Backend (`backend/src/`)
- `api/`: REST API endpoints
- `audio_utils.rs`: Audio processing utilities
- `db/`: Database models and migrations
- `discord/`: Discord bot integration and voice channel handling
- `file_handling.rs`: File system operations for sounds and recordings
- `main.rs`: Application entry point

### Frontend (`frontend/src/`)
- `app/`: Angular components, services, and modules
- `assets/`: Static assets
- `styles/`: Global styles (SCSS)

## Environment Configuration

### Required Environment Variables (for backend)
- `DISCORD_TOKEN`: Discord bot token (from Developer Portal)
- `DISCORD_CLIENT_ID`: Discord OAuth2 client ID
- `DISCORD_CLIENT_SECRET`: Discord OAuth2 client secret
- `BASE_URL`: URL where the app is accessible (e.g., http://localhost:4200 for dev)
- `ROCKET_SECRET_KEY`: Random key for cookie encryption
- `POSTGRES_PASSWORD`: Database password
- `ROCKET_DATABASES`: Database connection string

### Optional Environment Variables
- `LEGAL_URL`: Link to legal information page
- `RECORDING_LENGTH`: Recording duration in seconds (default: 60)
- `RUST_LOG`: Logging configuration (default: info)

## Key Conventions

### Backend
- Use async/await for asynchronous operations
- Leverage Rocket's dependency injection for database connections
- Use tracing macros for logging (trace!, debug!, info!, warn!, error!)
- Database migrations are managed via Diesel
- Audio files are stored in `/app/data/sounds` (production) or local volumes (dev)

### Frontend
- Use Angular standalone components
- Implement reactive patterns with RxJS
- Use Angular Material components for UI consistency
- Follow Angular style guide for component architecture
- Proxy API requests to backend during development (see `proxy.config.js`)

## Testing

### Backend
- No specific test runner configured in the workflow
- Follow standard Rust testing conventions with `#[cfg(test)]` modules

### Frontend
- Unit tests: `npm run test`
- Uses Jasmine and Karma
- Tests should be in `.spec.ts` files alongside components

## Docker and Deployment

- Application is containerized using Docker
- Multi-stage build process compiles both frontend and backend
- Dockerfile is in project root
- Production images are pushed to GitHub Container Registry
- Container runs with UID 1000

## CI/CD

- **Build workflow**: Compiles frontend, builds Docker image
- **Lint workflow**: Runs formatters and linters for both frontend and backend
- All checks must pass before merging

## Common Patterns

### Backend Route Handlers
```rust
#[get("/path")]
async fn handler(conn: DbConn) -> Result<Json<Response>, Status> {
    // Implementation
}
```

### Frontend Service Injection
```typescript
@Component({
  selector: 'app-example',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExampleComponent {
  private service = inject(ExampleService);
}
```

## Security Considerations
- Never commit Discord credentials or API tokens
- Use environment variables for sensitive configuration
- Validate user permissions before allowing bot commands
- Sanitize filenames using `sanitize-filename` crate

## Additional Resources
- [README.md](../README.md): Comprehensive usage and deployment guide
- Discord Developer Portal: https://discord.com/developers/applications
- Rocket Documentation: https://rocket.rs
- Angular Documentation: https://angular.dev
