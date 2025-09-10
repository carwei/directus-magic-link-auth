import { defineEndpoint } from '@directus/extensions-sdk';

/**
 * Magic Link UI Demo Endpoint
 * 
 * This endpoint provides a complete demo of the magic link authentication flow
 * without requiring JavaScript (to avoid CSP issues in Directus).
 * 
 * IMPORTANT: This is a demo/example implementation. It does NOT integrate with 
 * Directus Data Studio due to Content Security Policy (CSP) restrictions and 
 * session context limitations. Instead, it demonstrates how to implement magic 
 * link authentication in your own custom frontend.
 * 
 * Routes:
 * - GET  /             - Shows the email request form
 * - POST /send        - Processes form submission and sends magic link
 * - GET  /verify      - Verifies the magic link token and shows user info
 * 
 * HOW TO ADAPT THIS FOR YOUR CUSTOM FRONTEND:
 * 
 * 1. For a JavaScript-based frontend (React, Vue, etc.):
 *    - Replace the HTML forms with API calls to /magic-link-api/generate
 *    - Handle the verification by calling /magic-link-api/verify
 *    - Store the returned tokens (access_token, refresh_token) appropriately
 * 
 * 2. For server-side rendered apps (Next.js, Nuxt, etc.):
 *    - You can use a similar approach with form submissions
 *    - Or make server-side API calls to the magic-link-api endpoints
 * 
 * 3. Required environment variables (set in Directus):
 *    - PUBLIC_URL: Your Directus instance URL (e.g., https://example.com/server)
 *    - DIRECTUS_INTERNAL_URL: Internal URL for server-to-server calls (bypasses proxy)
 *    - Plus all the email configuration variables (see README)
 */
export default defineEndpoint((router, { services, database, env, logger }) => {
	// Configuration
	const config = {
		// PUBLIC_URL is used for links that users will click (goes through proxy if needed)
		publicUrl: env.PUBLIC_URL || 'http://localhost:8055',
		
		// DIRECTUS_INTERNAL_URL is used for server-to-server API calls
		// This bypasses any proxy (like NGINX) for direct communication
		// Example: If NGINX forwards example.com/server -> directus:8056
		// Then PUBLIC_URL = https://example.com/server
		// And DIRECTUS_INTERNAL_URL = http://directus:8056 (or http://172.x.x.x:8056)
		internalUrl: env.DIRECTUS_INTERNAL_URL || env.PUBLIC_URL || 'http://localhost:8055',
		
		// Optional: Add custom branding
		siteName: env.MAGIC_LINK_SITE_NAME || 'Magic Link Demo',
		primaryColor: '#667eea',
		linkExpiryMinutes: env.MAGIC_LINK_EXPIRATION_MINUTES || '15',
	};

	// Shared CSS styles for all pages
	// Developers can extract and customize these styles for their own design
	const sharedStyles = `
		* { margin: 0; padding: 0; box-sizing: border-box; }
		body {
			font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
			background: linear-gradient(135deg, ${config.primaryColor} 0%, #764ba2 100%);
			min-height: 100vh;
			display: flex;
			align-items: center;
			justify-content: center;
			padding: 20px;
		}
		.container {
			background: white;
			border-radius: 10px;
			box-shadow: 0 20px 60px rgba(0,0,0,0.3);
			padding: 40px;
			max-width: 400px;
			width: 100%;
			text-align: center;
		}
		h1 {
			margin-bottom: 20px;
			font-size: 24px;
		}
		p {
			color: #666;
			margin-bottom: 20px;
		}
		a {
			display: inline-block;
			padding: 12px 24px;
			background: linear-gradient(135deg, ${config.primaryColor} 0%, #764ba2 100%);
			color: white;
			text-decoration: none;
			border-radius: 5px;
			font-weight: 600;
		}
		a:hover {
			transform: translateY(-1px);
			box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
		}
	`;

	/**
	 * Helper function to create a complete HTML page
	 * This avoids inline JavaScript which would be blocked by CSP
	 */
	function createHTMLPage(title: string, content: string, additionalStyles: string = '') {
		return `
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>${title} - ${config.siteName}</title>
				<style>
					${sharedStyles}
					${additionalStyles}
				</style>
			</head>
			<body>
				<div class="container">
					${content}
				</div>
			</body>
			</html>
		`;
	}

	/**
	 * Middleware to parse URL-encoded form data
	 * This is needed because Directus doesn't parse form data by default
	 * 
	 * DEVELOPER NOTE: If you're building a JavaScript frontend, you won't need this.
	 * Instead, you'll send JSON data directly to the API endpoints.
	 */
	router.use('/send', (req, res, next) => {
		if (req.headers['content-type'] === 'application/x-www-form-urlencoded') {
			let body = '';
			req.on('data', chunk => {
				body += chunk.toString();
			});
			req.on('end', () => {
				const parsed = new URLSearchParams(body);
				req.body = {};
				for (const [key, value] of parsed) {
					req.body[key] = value;
				}
				next();
			});
		} else {
			next();
		}
	});

	/**
	 * GET / - Display the magic link request form
	 * 
	 * DEVELOPER NOTE: In your custom frontend, this would be your login page.
	 * You can copy the HTML structure and adapt it to your framework.
	 */
	router.get('/', (_req, res) => {
		// Page-specific styles
		const additionalStyles = `
			input[type="email"] {
				width: 100%;
				padding: 12px 16px;
				border: 2px solid #e1e8ed;
				border-radius: 5px;
				font-size: 16px;
				margin-bottom: 20px;
				transition: border-color 0.3s;
			}
			input[type="email"]:focus {
				outline: none;
				border-color: ${config.primaryColor};
			}
			button {
				width: 100%;
				padding: 12px;
				background: linear-gradient(135deg, ${config.primaryColor} 0%, #764ba2 100%);
				color: white;
				border: none;
				border-radius: 5px;
				font-size: 16px;
				font-weight: 600;
				cursor: pointer;
				transition: transform 0.2s;
			}
			button:hover {
				transform: translateY(-2px);
			}
			.info {
				background: #f0f8ff;
				border-left: 4px solid ${config.primaryColor};
				padding: 15px;
				margin-top: 30px;
				border-radius: 5px;
			}
			.info h2 {
				color: #333;
				font-size: 16px;
				margin-bottom: 10px;
			}
			.info p {
				text-align: left;
				font-size: 13px;
				margin-bottom: 5px;
			}
		`;

		// The HTML form that posts to /send
		// In a React/Vue app, you'd replace this with a component that calls the API
		const content = `
			<h1>🔐 ${config.siteName}</h1>
			<p>Enter your email to receive a secure login link</p>
			
			<form method="POST" action="${config.publicUrl}/magic-link-ui/send">
				<input 
					type="email" 
					name="email" 
					placeholder="your@email.com" 
					required
					autocomplete="email"
				/>
				<button type="submit">Send Magic Link</button>
			</form>
			
			<div class="info">
				<h2>ℹ️ How it works</h2>
				<p>1. Enter your email address</p>
				<p>2. Check your inbox for a magic link</p>
				<p>3. Click the link to verify your identity</p>
			</div>
		`;

		res.type('html');
		res.send(createHTMLPage('Login', content, additionalStyles));
	});

	/**
	 * POST /send - Process form submission and send magic link
	 * 
	 * DEVELOPER NOTE: In a JavaScript frontend, you would:
	 * 1. Call POST /magic-link-api/generate directly with JSON body
	 * 2. Show success/error message based on response
	 * 
	 * Example JavaScript code:
	 * ```javascript
	 * const response = await fetch('/magic-link-api/generate', {
	 *   method: 'POST',
	 *   headers: { 'Content-Type': 'application/json' },
	 *   body: JSON.stringify({ 
	 *     email: 'user@example.com',
	 *     redirectUrl: 'https://yourapp.com/verify' // Optional custom verify URL
	 *   })
	 * });
	 * const data = await response.json();
	 * ```
	 */
	router.post('/send', async (req, res) => {
		const email = req.body?.email;
		
		try {
			// Server-to-server call to the magic link API
			// We use internalUrl here to bypass any proxy
			const response = await fetch(`${config.internalUrl}/magic-link-api/generate`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					email: email,
					// The redirectUrl tells the API where the verification link should point
					// You can customize this to point to your own verification page
					redirectUrl: `${config.publicUrl}/magic-link-ui/verify`
				}),
			});
			
			const data = await response.json();
			
			// Show success or error message
			const content = data.success ? `
				<h1 style="color: #27ae60;">✉️ Check Your Email</h1>
				<p>${data.message || 'A magic link has been sent to your email address.'}</p>
				<p style="font-size: 14px; color: #999;">The link will expire in ${config.linkExpiryMinutes} minutes.</p>
				<a href="${config.publicUrl}/magic-link-ui">Send another link</a>
			` : `
				<h1 style="color: #e74c3c;">⚠️ Something went wrong</h1>
				<p>${data.message || 'Could not send magic link. Please try again.'}</p>
				<a href="${config.publicUrl}/magic-link-ui">Try again</a>
			`;
			
			res.type('html');
			res.send(createHTMLPage('Magic Link Sent', content));
		} catch (error) {
			logger.error('Error calling magic link API:', error);
			
			const content = `
				<h1 style="color: #e74c3c;">⚠️ Error</h1>
				<p>An error occurred: ${error.message}</p>
				<a href="${config.publicUrl}/magic-link-ui">Go back</a>
			`;
			
			res.type('html');
			res.status(500).send(createHTMLPage('Error', content));
		}
	});

	/**
	 * GET /verify - Verify magic link token and display user information
	 * 
	 * DEVELOPER NOTE: In a JavaScript frontend, you would:
	 * 1. Extract the token from the URL
	 * 2. Call GET /magic-link-api/verify?token=xxx
	 * 3. Store the returned tokens (access_token, refresh_token)
	 * 4. Redirect to your app's dashboard
	 * 
	 * Example JavaScript code:
	 * ```javascript
	 * const urlParams = new URLSearchParams(window.location.search);
	 * const token = urlParams.get('token');
	 * 
	 * const response = await fetch(`/magic-link-api/verify?token=${token}`);
	 * const data = await response.json();
	 * 
	 * if (data.success) {
	 *   // Store tokens (cookies, localStorage, or state management)
	 *   localStorage.setItem('access_token', data.data.access_token);
	 *   // Note: refresh_token is usually set as HTTP-only cookie by the API
	 *   
	 *   // Redirect to dashboard
	 *   window.location.href = '/dashboard';
	 * }
	 * ```
	 */
	router.get('/verify', async (req, res) => {
		const token = req.query?.token as string;
		
		// No token provided - show error
		if (!token) {
			const content = `
				<h1 style="color: #e74c3c;">❌ Invalid Link</h1>
				<p>This magic link is invalid or has expired.</p>
				<a href="${config.publicUrl}/magic-link-ui">Request a new link</a>
			`;
			
			res.type('html');
			return res.status(400).send(createHTMLPage('Invalid Link', content));
		}

		try {
			// Server-to-server call to verify the token
			// The API will return user data and authentication tokens
			const response = await fetch(`${config.internalUrl}/magic-link-api/verify?token=${token}`);
			const data = await response.json();
			
			if (data.success && data.data?.user) {
				// Success - show user information
				// In a real app, you'd use the tokens to maintain the session
				const user = data.data.user;
				
				// Styles for the success page
				const additionalStyles = `
					.success-icon {
						font-size: 48px;
						margin-bottom: 20px;
					}
					.success-message {
						background: #f0fff4;
						color: #22543d;
						border: 1px solid #9ae6b4;
						padding: 12px;
						border-radius: 5px;
						margin-bottom: 20px;
					}
					.user-profile {
						background: #f8f9fa;
						border-radius: 8px;
						padding: 20px;
						margin: 20px 0;
						text-align: left;
					}
					.user-profile h3 {
						color: #495057;
						margin-bottom: 15px;
						font-size: 18px;
					}
					.user-field {
						display: flex;
						justify-content: space-between;
						padding: 10px 0;
						border-bottom: 1px solid #dee2e6;
					}
					.user-field:last-child {
						border-bottom: none;
					}
					.user-field strong {
						color: #495057;
						font-weight: 500;
					}
					.user-field span {
						color: #6c757d;
					}
					.info-box {
						background: #e3f2fd;
						border-radius: 8px;
						padding: 15px;
						margin: 20px 0;
						font-size: 14px;
						color: #333;
					}
					.token-display {
						background: #f5f5f5;
						padding: 10px;
						border-radius: 5px;
						margin-top: 10px;
						font-family: monospace;
						font-size: 12px;
						word-break: break-all;
					}
					.actions {
						margin-top: 30px;
					}
					.actions a {
						margin: 0 10px;
					}
				`;

				// Display user information
				// In production, you wouldn't show tokens, but this is helpful for debugging
				const content = `
					<div class="success-icon">✅</div>
					<h1 style="color: #27ae60;">Magic Link Verified!</h1>
					<div class="success-message">
						Your identity has been successfully verified.
					</div>
					
					<div class="user-profile">
						<h3>👤 User Information</h3>
						<div class="user-field">
							<strong>ID:</strong>
							<span>${user.id}</span>
						</div>
						<div class="user-field">
							<strong>Email:</strong>
							<span>${user.email}</span>
						</div>
						${user.first_name ? `
						<div class="user-field">
							<strong>First Name:</strong>
							<span>${user.first_name}</span>
						</div>
						` : ''}
						${user.last_name ? `
						<div class="user-field">
							<strong>Last Name:</strong>
							<span>${user.last_name}</span>
						</div>
						` : ''}
					</div>
					
					<div class="info-box">
						<strong>🔑 Authentication Details:</strong><br>
						Authentication tokens have been generated successfully.<br>
						<br>
						<strong>What happens in a real application:</strong><br>
						• The access_token would be stored for API calls<br>
						• The refresh_token is set as an HTTP-only cookie<br>
						• You would be redirected to your application dashboard<br>
						<br>
						<strong>Token Info (for debugging):</strong>
						<div class="token-display">
							Access Token: ${data.data.access_token ? data.data.access_token.substring(0, 20) + '...' : 'Not provided'}<br>
							Expires in: ${data.data.expires ? Math.round(data.data.expires / 1000 / 60) + ' minutes' : 'Unknown'}
						</div>
					</div>
					
					<div class="actions">
						<a href="${config.publicUrl}/magic-link-ui">Try Another Email</a>
					</div>
				`;
				
				res.type('html');
				res.send(createHTMLPage('Verification Successful', content, additionalStyles));
			} else {
				throw new Error(data.message || 'Verification failed');
			}
		} catch (error) {
			// Verification failed - show error
			const content = `
				<h1 style="color: #e74c3c;">❌ Verification Failed</h1>
				<p>${error.message || 'This magic link is invalid or has expired.'}</p>
				<a href="${config.publicUrl}/magic-link-ui">Request a new magic link</a>
			`;
			
			res.type('html');
			res.status(400).send(createHTMLPage('Verification Failed', content));
		}
	});
});