// /extensions/endpoints/magic-link/index.js
import { defineEndpoint } from '@directus/extensions-sdk';
import crypto from 'crypto';
import nodemailer from 'nodemailer';

export default defineEndpoint((router, { services, database, env, logger }) => {
	const { AuthenticationService } = services;

	// Create a reusable transporter using SMTP configuration from environment
	const transporter = nodemailer.createTransport({
		host: env.EMAIL_SMTP_HOST || 'smtp.example.com',
		port: parseInt(env.EMAIL_SMTP_PORT || '587'),
		secure: env.EMAIL_SMTP_SECURE === 'true', // true for 465, false for other ports
		auth: {
			user: env.EMAIL_SMTP_USER || '',
			pass: env.EMAIL_SMTP_PASSWORD || ''
		}
	});

	// Get role lists from environment variables (empty arrays if not set)
	const allowedRolesStr = env.MAGIC_LINK_ALLOWED_ROLES || '';
	const disallowedRolesStr = env.MAGIC_LINK_DISALLOWED_ROLES || '';

	const allowedRoles = allowedRolesStr
		.split(',')
		.map((r) => r.trim())
		.filter(Boolean);
	const disallowedRoles = disallowedRolesStr
		.split(',')
		.map((r) => r.trim())
		.filter(Boolean);

	// Maximum requests per hour (default: 5)
	const maxRequestsPerHour = parseInt(env.MAGIC_LINK_MAX_REQUESTS_PER_HOUR || '5');

	// Configuration options with defaults
	const config = {
		fromEmail: env.EMAIL_SMTP_USER || '"Magic Link" <noreply@example.com>',
		expirationMinutes: parseInt(env.MAGIC_LINK_EXPIRATION_MINUTES || '15'),
		publicUrl: env.PUBLIC_URL || 'http://localhost:8055',
		emailSubject: env.MAGIC_LINK_SUBJECT || 'Your Magic Login Link',
		verifyEndpoint: env.MAGIC_LINK_VERIFY_ENDPOINT || '/magic-link/verify'
	};

	// Custom email sending function with improved error handling and logging
	async function sendEmail(to, subject, text) {
		logger.debug(`Attempting to send email to: ${to}`);
		logger.debug(
			`Using SMTP configuration - Host: ${env.EMAIL_SMTP_HOST}, Port: ${env.EMAIL_SMTP_PORT}, Secure: ${env.EMAIL_SMTP_SECURE}`
		);
		logger.debug(`Using From address: ${config.fromEmail}`);

		try {
			// Verify SMTP connection before sending
			logger.debug('Verifying SMTP connection...');
			await transporter.verify();
			logger.debug('SMTP connection verified successfully');

			// Proceed with sending the email
			const info = await transporter.sendMail({
				from: config.fromEmail,
				to,
				subject,
				text
			});

			logger.debug(`Email sent successfully. Message ID: ${info.messageId}`);
			return info;
		} catch (error) {
			// Detailed SMTP error logging
			logger.error(`Error sending email: ${error.message}`);

			// Log more details about the error
			if (error.code) logger.error(`SMTP Error Code: ${error.code}`);
			if (error.command) logger.error(`SMTP Command: ${error.command}`);
			if (error.response) logger.error(`SMTP Response: ${error.response}`);

			// Check for common SMTP issues
			if (error.message.includes('Greeting never received')) {
				logger.error(
					'SMTP Connection Issue: The server did not respond with a greeting. This could indicate:'
				);
				logger.error('1. The SMTP server address is incorrect');
				logger.error('2. The SMTP port is blocked or incorrect');
				logger.error('3. Firewall is blocking the connection');
				logger.error('4. SMTP server is down or unreachable');
			}

			if (error.message.includes('Authentication failed')) {
				logger.error(
					'SMTP Authentication Issue: Could not authenticate with the provided credentials.'
				);
				logger.error('Please check EMAIL_SMTP_USER and EMAIL_SMTP_PASSWORD environment variables.');
			}

			if (
				error.message.includes('Policy violation') ||
				error.message.includes('unauthorized use of sender')
			) {
				logger.error(
					'SMTP Authorization Issue: You are not authorized to send from this email address.'
				);
				logger.error(
					`1. Make sure the "from" address (${config.fromEmail}) is allowed by your SMTP provider`
				);
				logger.error(
					'2. The "from" address usually needs to match or be authorized for your SMTP account'
				);
				logger.error('3. Check your EMAIL_FROM environment variable');
			}

			throw error; // Re-throw to handle in the calling function
		}
	}

	// Basic test route - no auth required
	router.get('/', (_req, res) => res.send('Magic Link Authentication Endpoint'));

	// Generate magic link
	router.post('/generate', async (req, res) => {
		try {
			logger.debug('Magic link generation requested');

			const email = req.body?.email;
			// Get redirectUrl from request if provided
			const redirectUrl = req.body?.redirectUrl;

			// Validate email - use generic error message
			if (!email) {
				logger.debug('Request missing email parameter');
				return res.status(400).send({
					success: false,
					message: 'Please provide a valid email address'
				});
			}

			// Basic email format validation
			const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
			if (!emailRegex.test(email)) {
				logger.debug(`Invalid email format: ${email}`);
				return res.status(400).send({
					success: false,
					message: 'Please provide a valid email address'
				});
			}

			// Send the response immediately to prevent timing attacks
			res.send({
				success: true,
				message: 'If your email exists in our system, a magic link has been sent'
			});

			// Continue processing asynchronously after sending the response
			processEmailRequest(email, req, redirectUrl).catch((error) => {
				logger.error(`Error in async processing: ${error.message}`);
				logger.debug(error.stack);
			});
		} catch (error) {
			logger.error(`Error in generate endpoint: ${error.message}`);
			logger.debug(error.stack);

			return res.status(500).send({
				success: false,
				message: 'An error occurred while processing your request'
			});
		}
	});

	// Process email request asynchronously after response is sent
	async function processEmailRequest(email, req, redirectUrl) {
		// Get client info
		const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
		const userAgent = req.headers['user-agent'] || 'unknown';

		try {
			// Check rate limits for this email
			const recentRequests = await database('extension_magic_link')
				.where({ email })
				.where('created_at', '>', new Date(Date.now() - 3600000)) // Last hour
				.count('id as count');

			const requestCount = parseInt(recentRequests[0].count);

			if (requestCount >= maxRequestsPerHour) {
				logger.debug(
					`Rate limit exceeded for email: ${email} (${requestCount}/${maxRequestsPerHour} per hour)`
				);

				// Invalidate all existing tokens for this user
				await database('extension_magic_link')
					.where({ email: email, used: false })
					.update({ used: true, email_error: 'Superseded by new token' });

				// Record the rate-limited attempt for audit purposes
				await database('extension_magic_link').insert({
					email,
					token: crypto.randomBytes(32).toString('hex'), // Random token
					expires_at: new Date(Date.now() + 60000), // 1 minute expiry
					ip_address: ipAddress,
					user_agent: userAgent,
					used: true, // Mark as used so it can't be actually used
					created_at: new Date(),
					email_sent: false,
					email_error: 'Rate limit exceeded'
				});

				return; // Stop processing
			}

			// Check if user exists - but don't tell the client if they don't
			const user = await database
				.select('id', 'email', 'role')
				.from('directus_users')
				.where({ email })
				.first();

			// If user doesn't exist, still record the attempt for rate limiting
			if (!user) {
				logger.debug(`User with email ${email} not found, recording attempt for rate limiting`);

				await database('extension_magic_link').insert({
					email,
					token: crypto.randomBytes(32).toString('hex'), // Random token
					expires_at: new Date(Date.now() + 60000), // 1 minute expiry
					ip_address: ipAddress,
					user_agent: userAgent,
					used: true, // Mark as used so it can't be actually used
					created_at: new Date(),
					email_sent: false,
					email_error: 'User does not exist'
				});

				return; // Stop processing
			}

			// Apply role-based access control

			// If allowed roles are specified, check if user has one
			if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
				logger.debug(`Magic link denied: User role ${user.role} not in allowed roles list`);

				// Record the attempt for rate limiting
				await database('extension_magic_link').insert({
					email: user.email,
					token: crypto.randomBytes(32).toString('hex'),
					expires_at: new Date(Date.now() + 60000),
					ip_address: ipAddress,
					user_agent: userAgent,
					used: true,
					created_at: new Date(),
					email_sent: false,
					email_error: 'User role not allowed'
				});

				return; // Stop processing
			}

			// If disallowed roles are specified, check if user has one
			if (disallowedRoles.length > 0 && disallowedRoles.includes(user.role)) {
				logger.debug(`Magic link denied: User role ${user.role} in disallowed roles list`);

				// Record the attempt for rate limiting
				await database('extension_magic_link').insert({
					email: user.email,
					token: crypto.randomBytes(32).toString('hex'),
					expires_at: new Date(Date.now() + 60000),
					ip_address: ipAddress,
					user_agent: userAgent,
					used: true,
					created_at: new Date(),
					email_sent: false,
					email_error: 'User role disallowed'
				});

				return; // Stop processing
			}

			// Generate a secure token
			const token = crypto.randomBytes(32).toString('hex');

			// Set expiration time
			const expiresAt = new Date();
			expiresAt.setMinutes(expiresAt.getMinutes() + config.expirationMinutes);

			// Invalidate all existing tokens for this user
			await database('extension_magic_link')
				.where({ email: user.email, used: false })
				.update({ used: true, email_error: 'Superseded by new token' });

			// Store the new token in the database - email_sent defaults to NULL (pending)
			await database('extension_magic_link').insert({
				email: user.email,
				token,
				expires_at: expiresAt,
				ip_address: ipAddress,
				user_agent: userAgent,
				used: false,
				created_at: new Date(),
				email_sent: null,
				email_error: null
			});

			// When constructing the verification URL, use the redirectUrl if provided
			// Otherwise use the default URL from config
			let verificationUrl;
			if (redirectUrl) {
				// Use the provided redirectUrl but append the token
				verificationUrl = `${redirectUrl}?token=${token}`;
				logger.debug(`Using custom redirect URL: ${verificationUrl}`);
			} else {
				// Use the default URL
				verificationUrl = `${config.publicUrl}${config.verifyEndpoint}?token=${token}`;
				logger.debug(`Using default verification URL: ${verificationUrl}`);
			}

			logger.debug(`Magic link generated for ${user.email}, expires at ${expiresAt.toISOString()}`);
			logger.debug(`Verification URL: ${verificationUrl}`);

			try {
				logger.debug('Attempting to send magic link email');

				// Send email using our custom function
				await sendEmail(
					user.email,
					config.emailSubject,
					`Login Request

Click the link below to log in. This link will expire in ${config.expirationMinutes} minutes.

${verificationUrl}

If you didn't request this link, you can safely ignore this email.

Best regards,
Your Team`
				);

				// Update the token record to indicate successful email delivery
				await database('extension_magic_link').where({ token }).update({
					email_sent: true,
					email_error: null
				});

				logger.debug(`Magic link email sent successfully to ${user.email}`);
			} catch (error) {
				// More detailed error handling
				logger.error(`Failed to send magic link email: ${error.message}`);

				// Update the token record to indicate email sending failed
				await database('extension_magic_link')
					.where({ token })
					.update({
						email_sent: false,
						email_error: error.message.substring(0, 255) // Store truncated error message
					});

				// Log attempted email for manual follow-up if needed
				logger.info(`Email sending failed for token: ${token}, user: ${user.email}`);
			}
		} catch (error) {
			logger.error(`Error processing email request: ${error.message}`);
			logger.debug(error.stack);
		}
	}

	// Verify magic link
	router.get('/verify', async (req, res) => {
		try {
			logger.debug('Magic link verification requested');

			const token = req.query?.token;

			// Validate token - use generic error
			if (!token) {
				logger.debug('Request missing token parameter');
				return res.status(400).send({
					success: false,
					message: 'Invalid or missing token'
				});
			}

			// Look up the token in the database
			const tokenRecord = await database
				.select('*')
				.from('extension_magic_link')
				.where({ token })
				.first();

			// Use a consistent error message for all token issues
			if (!tokenRecord) {
				logger.debug(`Token not found: ${token}`);
				return res.status(401).send({
					success: false,
					message: 'Invalid or expired link. Please request a new one.'
				});
			}

			// Check if token is expired
			if (new Date(tokenRecord.expires_at) < new Date()) {
				logger.debug(`Token expired at ${tokenRecord.expires_at}`);
				return res.status(401).send({
					success: false,
					message: 'Invalid or expired link. Please request a new one.'
				});
			}

			// Check if token has already been used
			if (tokenRecord.used) {
				logger.debug(`Token already used: ${token}`);
				return res.status(401).send({
					success: false,
					message: 'Invalid or expired link. Please request a new one.'
				});
			}

			// Find the user associated with this token
			const user = await database
				.select('id', 'email', 'first_name', 'last_name', 'role')
				.from('directus_users')
				.where({ email: tokenRecord.email })
				.first();

			if (!user) {
				logger.debug(`User not found for token: ${token}`);
				return res.status(401).send({
					success: false,
					message: 'Invalid or expired link. Please request a new one.'
				});
			}

			// Apply role-based access control on verification too
			// If allowed roles are specified, check if user has one
			if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
				logger.debug(
					`Magic link verification denied: User role ${user.role} not in allowed roles list`
				);
				return res.status(401).send({
					success: false,
					message: 'Invalid or expired link. Please request a new one.'
				});
			}

			// If disallowed roles are specified, check if user has one
			if (disallowedRoles.length > 0 && disallowedRoles.includes(user.role)) {
				logger.debug(
					`Magic link verification denied: User role ${user.role} in disallowed roles list`
				);
				return res.status(401).send({
					success: false,
					message: 'Invalid or expired link. Please request a new one.'
				});
			}

			// Create a refresh token
			const refreshToken = crypto.randomBytes(32).toString('hex');
			const refreshTokenExpiration = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

			// Store refresh token in the database with user ID
			await database('directus_sessions').insert({
				token: refreshToken,
				user: user.id,
				expires: refreshTokenExpiration,
				ip: req.ip,
				user_agent: req.get('user-agent'),
				origin: req.get('origin')
			});

			// Use AuthenticationService to generate access and refresh tokens
			const authenticationService = new AuthenticationService({
				accountability: {
					ip: req.ip,
					userAgent: req.get('user-agent'),
					origin: req.get('origin')
				},
				schema: req.schema
			});

			try {
				// The refresh method creates new tokens from an existing refresh token
				const {
					accessToken,
					refreshToken: newRefreshToken,
					expires
				} = await authenticationService.refresh(refreshToken);

				// Get CORS origin and protocol
				const origin = req.get('origin') || '';
				const isSecure = origin.startsWith('https://') || process.env.NODE_ENV === 'production';

				// Determine if cross-origin request and set appropriate cookie settings
				const isCrossOrigin = origin && req.get('host') && !origin.includes(req.get('host'));
				const sameSiteSetting = isCrossOrigin ? 'none' : 'lax';

				logger.debug(
					`Cookie setup - Origin: ${origin}, Secure: ${isSecure}, Cross-Origin: ${isCrossOrigin}, SameSite: ${sameSiteSetting}`
				);

				// Set the refresh token cookie with appropriate security settings
				res.cookie('directus_refresh_token', newRefreshToken, {
					httpOnly: true,
					maxAge: expires,
					secure: isSecure,
					sameSite: sameSiteSetting,
					path: '/'
				});

				// Also set token in Authorization header for this response
				res.setHeader('Authorization', `Bearer ${accessToken}`);

				logger.debug(`Authentication successful for user: ${user.email}`);
				logger.debug(`Cookie settings - Secure: ${isSecure}, SameSite: ${sameSiteSetting}`);

				// NOT marking the token as used to allow multiple attempts with the same link
				// This helps prevent issues with email clients or browsers that may try to verify the link multiple times
				// await database('extension_magic_link').where({ id: tokenRecord.id }).update({ used: true });
				logger.debug(`Token kept active for user: ${user.email} (allowing multiple verification attempts)`);

				// Return the tokens to the client
				return res.send({
					success: true,
					message: 'Authentication successful',
					data: {
						user: {
							id: user.id,
							email: user.email,
							first_name: user.first_name,
							last_name: user.last_name
						},
						access_token: accessToken,
						refresh_token: newRefreshToken,
						expires
					}
				});
			} catch (authError) {
				// If authentication fails, do NOT mark the token as used so it can be retried
				logger.error(`Authentication service error: ${authError.message}`);
				logger.debug(authError.stack);

				return res.status(500).send({
					success: false,
					message: 'An error occurred during authentication. Please try again.'
				});
			}
		} catch (error) {
			logger.error(`Error verifying magic link: ${error.message}`);
			logger.debug(error.stack);

			return res.status(500).send({
				success: false,
				message: 'An error occurred while processing your request'
			});
		}
	});
});
