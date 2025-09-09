# Directus Magic Link Auth

A Directus extension that adds secure, passwordless authentication to your Directus instance through magic links sent via email.

## Features

- **Passwordless Authentication**: Allow users to log in with just their email address
- **Secure Implementation**:
  - Cryptographically secure time tokens (1 minute window of use)
  - Protection against timing attacks
  - Prevention of user enumeration
  - Token invalidation when new tokens are requested
- **Rate Limiting**: Configurable limits on magic link requests per hour
- **Role-Based Access Control**: Restrict magic link usage to specific user roles
- **Detailed Logging**: Comprehensive logs for debugging and security auditing
- **IP & User Agent Tracking**: All requests are logged with IP address and user agent for security auditing
- **SMTP Configuration**: Uses Directus's built-in email configuration (environment variables)
- **Customizable**: Configure expiration times, email subjects, and more

## Potential Future Enhancements

This is currently not implemented, but could be added in future versions if needed:

- Make the full e-mail customizable (not just the subject)
- Make the links true single use (there is currently a 1 minute window after the first use to use it again, to allow for accidental triggering by e-mail clients)
- Sending email using any `EMAIL_TRANSPORT` mode (not only SMTP)
- Login module that works with the Directus Data Studio app (without a custom frontend)
- Installation via the Directus Marketplace

## Installation

### Prerequisites

- Directus 10.0.0 or higher
- PostgreSQL, MySQL, or SQLite database
- SMTP server for sending emails (configured with Directus [environment variables](https://directus.io/docs/configuration/email#smtp))

### Installation Steps

1. **Install the extension**

   Currently only manual installation is supported.

   - Create a folder to your Directus extensions directory: `./extensions/directus-magic-link-auth`
   - In this repository, copy the `/dist` folder and it's content into your newly created `directus-magic-link-auth` folder
   - In this repository, also copy the `package.json` into your newly created `directus-magic-link-auth` folder

   You should now have the following structure:

   ```
   /extensions
     /directus-magic-link-auth
       /dist
         /api.js
         /app.js
       package.json
   ```

2. **Create the database table**

   Run the following SQL code to create the required table `extension_magic_link`:

   ```sql
   -- Extension table for magic links
   CREATE TABLE extension_magic_link (
     id serial PRIMARY KEY,
     email varchar(255) NOT NULL,
     token varchar(255) NOT NULL,
     expires_at timestamp NOT NULL,
     ip_address varchar(255) NOT NULL,
     user_agent text,
     used boolean NOT NULL DEFAULT false,
     created_at timestamp NOT NULL,
     email_sent boolean DEFAULT NULL,
     email_error varchar(255)
   );

   -- Create indexes for better performance
   CREATE INDEX idx_magic_link_token ON extension_magic_link(token);
   CREATE INDEX idx_magic_link_email ON extension_magic_link(email);
   CREATE INDEX idx_magic_link_created_at ON extension_magic_link(created_at);
   ```

3. **Configure environment variables**

   Make sure you have SMTP configuration set (see the section **Configuration Options** for all configuration options):

   ```
   # SMTP Configuration (mirrors Directus SMTP email settings)
   EMAIL_SMTP_HOST=smtp.example.com
   EMAIL_SMTP_PORT=587
   EMAIL_SMTP_USER=your-smtp-username
   EMAIL_SMTP_PASSWORD=your-smtp-password
   EMAIL_FROM="Your Name <email@example.com>"
   ```

## Usage

### Generating a Magic Link

Send a POST request to `/magic-link-api/generate` with the following body:

```json
{
  "email": "user@example.com"
}
```

This will:

1. Check if the user exists in your Directus instance
2. Verify the user's role is allowed to use magic links
3. Verify rate limits haven't been exceeded
4. Generate a secure token
5. Store the token in the database
6. Send an email with a login link

### Verifying a Magic Link

When a user clicks the link in the email, they will be directed to:

```
https://your-directus-url.com/magic-link/verify?token=YOUR_TOKEN
```

This will:

1. Validate the token
2. Check if the token has expired or been used
3. Verify the user's role is still allowed to use magic links
4. If valid, authenticate the user and return a Directus session
5. Invalidate the token to prevent reuse

### Frontend Integration

In your frontend application, you can add a simple form to request a magic link:

```html
<form id="magic-link-form">
  <input type="email" id="email" placeholder="Enter your email" required />
  <button type="submit">Send Magic Link</button>
</form>

<script>
  document
    .getElementById("magic-link-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("email").value;

      try {
        const response = await fetch(
          "https://your-directus-url.com/magic-link/generate",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ email }),
          }
        );

        const data = await response.json();

        if (data.success) {
          alert("Check your email for a magic link!");
        } else {
          alert(data.message);
        }
      } catch (error) {
        console.error("Error:", error);
        alert("An error occurred. Please try again.");
      }
    });
</script>
```

## Configuration Options

| Environment Variable               | Description                                                     | Default                   |
| ---------------------------------- | --------------------------------------------------------------- | ------------------------- |
| `EMAIL_SMTP_HOST`                  | SMTP server hostname                                            | `smtp.example.com`        |
| `EMAIL_SMTP_PORT`                  | SMTP server port                                                | `587`                     |
| `EMAIL_SMTP_SECURE`                | Use secure connection (SSL/TLS)                                 | `false`                   |
| `EMAIL_SMTP_USER`                  | SMTP username                                                   | -                         |
| `EMAIL_SMTP_PASSWORD`              | SMTP password                                                   | -                         |
| `EMAIL_FROM`                       | From email address                                              | `EMAIL_SMTP_USER`         |
| `MAGIC_LINK_EXPIRATION_MINUTES`    | How long the magic link is valid                                | `15`                      |
| `MAGIC_LINK_SUBJECT`               | Email subject                                                   | `"Your Magic Login Link"` |
| `MAGIC_LINK_VERIFY_ENDPOINT`       | Endpoint for verification                                       | `"/magic-link/verify"`    |
| `MAGIC_LINK_MAX_REQUESTS_PER_HOUR` | Rate limit for requests per email per hour                      | `5`                       |
| `MAGIC_LINK_ALLOWED_ROLES`         | Comma-separated list of role IDs allowed to use magic links     | (empty = all roles)       |
| `MAGIC_LINK_DISALLOWED_ROLES`      | Comma-separated list of role IDs not allowed to use magic links | (empty = no restrictions) |
| `PUBLIC_URL`                       | Your Directus instance URL                                      | `http://localhost:8055`   |

## Role-Based Access Control

You can control which user roles can use magic links:

- If neither `MAGIC_LINK_ALLOWED_ROLES` nor `MAGIC_LINK_DISALLOWED_ROLES` is set, all users can use magic links
- If only `MAGIC_LINK_ALLOWED_ROLES` is set, only users with those roles can use magic links
- If only `MAGIC_LINK_DISALLOWED_ROLES` is set, all users except those with the specified roles can use magic links
- If both are set, `MAGIC_LINK_ALLOWED_ROLES` takes precedence (only users with allowed roles, and not in disallowed roles, can use magic links)

Example:

```
# Only allow the Student and Teacher roles
MAGIC_LINK_ALLOWED_ROLES=student-role-id,teacher-role-id

# Block the Admin role from using magic links
MAGIC_LINK_DISALLOWED_ROLES=admin-role-id
```

## Logging

This extension integrates with Directus's logging system. To enable debug logs, set the `LOG_LEVEL` environment variable:

```
LOG_LEVEL=debug
```

This will output detailed information about magic link generation and verification, which can be helpful for troubleshooting.

## Dependencies

- [nodemailer](https://nodemailer.com/) - For handling email sending
- [nanoid](https://github.com/ai/nanoid) - For secure token generation

## License

This project is licensed under the MIT License - see the LICENSE file for details.
