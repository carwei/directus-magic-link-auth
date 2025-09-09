import { defineEndpoint } from '@directus/extensions-sdk';

export default defineEndpoint((router, { services, database, env, logger }) => {
	// Configuration
	const config = {
		publicUrl: env.PUBLIC_URL || 'http://localhost:8055',
	};

	// Serve JavaScript for the request form
	router.get('/request.js', (_req, res) => {
		const js = `
			(function() {
				const form = document.getElementById('magicLinkForm');
				const emailInput = document.getElementById('email');
				const submitBtn = document.getElementById('submitBtn');
				const successMessage = document.getElementById('successMessage');
				const errorMessage = document.getElementById('errorMessage');
				
				if (form) {
					form.addEventListener('submit', async (e) => {
						e.preventDefault();
						
						// Hide messages
						successMessage.classList.add('hidden');
						errorMessage.classList.add('hidden');
						
						// Disable form
						submitBtn.disabled = true;
						submitBtn.textContent = 'Sending...';
						
						try {
							const response = await fetch('/magic-link-api/generate', {
								method: 'POST',
								headers: {
									'Content-Type': 'application/json',
								},
								body: JSON.stringify({
									email: emailInput.value,
									redirectUrl: window.location.origin + '/magic-link-ui/verify'
								}),
							});
							
							const data = await response.json();
							
							if (data.success) {
								successMessage.textContent = data.message || 'Check your email for the magic link!';
								successMessage.classList.remove('hidden');
								emailInput.value = '';
							} else {
								errorMessage.textContent = data.message || 'Something went wrong. Please try again.';
								errorMessage.classList.remove('hidden');
							}
						} catch (error) {
							errorMessage.textContent = 'Network error. Please check your connection and try again.';
							errorMessage.classList.remove('hidden');
						} finally {
							submitBtn.disabled = false;
							submitBtn.textContent = 'Send Magic Link';
						}
					});
				}
			})();
		`;
		
		res.type('application/javascript');
		res.send(js);
	});

	// Serve JavaScript for the verification page
	router.get('/verify.js', (_req, res) => {
		const js = `
			(function() {
				const loadingDiv = document.getElementById('loading');
				const successDiv = document.getElementById('success');
				const errorDiv = document.getElementById('error');
				const errorMessage = document.getElementById('errorMessage');
				
				// Get return URL from query params
				const urlParams = new URLSearchParams(window.location.search);
				const token = urlParams.get('token');
				const returnUrl = urlParams.get('returnUrl') || '/admin/content';
				
				async function verifyToken() {
					if (!token) return;
					
					try {
						const response = await fetch('/magic-link-api/verify?token=' + token);
						const data = await response.json();
						
						if (data.success) {
							// Store tokens if needed (the cookie is already set by the API)
							if (data.data?.access_token) {
								// Optional: Store access token in localStorage for API calls
								localStorage.setItem('directus_access_token', data.data.access_token);
							}
							
							// Show success message
							loadingDiv.classList.add('hidden');
							successDiv.classList.remove('hidden');
							
							// Redirect after a short delay
							setTimeout(() => {
								window.location.href = returnUrl;
							}, 2000);
						} else {
							throw new Error(data.message || 'Verification failed');
						}
					} catch (error) {
						loadingDiv.classList.add('hidden');
						errorDiv.classList.remove('hidden');
						errorMessage.textContent = error.message || 'An error occurred during verification.';
					}
				}
				
				// Start verification immediately if we have elements
				if (loadingDiv && successDiv && errorDiv) {
					verifyToken();
				}
			})();
		`;
		
		res.type('application/javascript');
		res.send(js);
	});

	// Root route - shows the magic link request form
	router.get('/', (_req, res) => {
		const html = `
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>Magic Link Login</title>
				<style>
					* { margin: 0; padding: 0; box-sizing: border-box; }
					body {
						font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
						background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
					}
					h1 {
						color: #333;
						margin-bottom: 10px;
						font-size: 24px;
						text-align: center;
					}
					p {
						color: #666;
						margin-bottom: 30px;
						text-align: center;
						font-size: 14px;
					}
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
						border-color: #667eea;
					}
					button {
						width: 100%;
						padding: 12px;
						background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
					button:disabled {
						opacity: 0.6;
						cursor: not-allowed;
						transform: none;
					}
					.message {
						padding: 12px;
						border-radius: 5px;
						margin-bottom: 20px;
						text-align: center;
						font-size: 14px;
					}
					.success {
						background: #d4edda;
						color: #155724;
						border: 1px solid #c3e6cb;
					}
					.error {
						background: #f8d7da;
						color: #721c24;
						border: 1px solid #f5c6cb;
					}
					.hidden { display: none; }
				</style>
			</head>
			<body>
				<div class="container">
					<h1>🔐 Magic Link Login</h1>
					<p>Enter your email to receive a secure login link</p>
					
					<div id="successMessage" class="message success hidden"></div>
					<div id="errorMessage" class="message error hidden"></div>
					
					<form id="magicLinkForm">
						<input 
							type="email" 
							id="email" 
							placeholder="your@email.com" 
							required
							autocomplete="email"
						/>
						<button type="submit" id="submitBtn">Send Magic Link</button>
					</form>
				</div>
				
				<script src="/magic-link-ui/request.js"></script>
			</body>
			</html>
		`;
		
		res.type('html');
		res.send(html);
	});

	// Verify route - handles the magic link verification
	router.get('/verify', async (req, res) => {
		const token = req.query?.token as string;
		
		// If no token, show error page
		if (!token) {
			const errorHtml = `
				<!DOCTYPE html>
				<html lang="en">
				<head>
					<meta charset="UTF-8">
					<meta name="viewport" content="width=device-width, initial-scale=1.0">
					<title>Invalid Link</title>
					<style>
						* { margin: 0; padding: 0; box-sizing: border-box; }
						body {
							font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
							background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
						h1 { color: #e74c3c; margin-bottom: 20px; }
						p { color: #666; margin-bottom: 20px; }
						a {
							display: inline-block;
							padding: 12px 24px;
							background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
							color: white;
							text-decoration: none;
							border-radius: 5px;
							font-weight: 600;
						}
					</style>
				</head>
				<body>
					<div class="container">
						<h1>❌ Invalid Link</h1>
						<p>This magic link is invalid or has expired.</p>
						<a href="/magic-link-ui">Request a new link</a>
					</div>
				</body>
				</html>
			`;
			res.type('html');
			return res.status(400).send(errorHtml);
		}

		// Show a processing page that will verify the token
		const processingHtml = `
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>Verifying...</title>
				<style>
					* { margin: 0; padding: 0; box-sizing: border-box; }
					body {
						font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
						background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
					h1 { color: #333; margin-bottom: 20px; }
					.spinner {
						border: 3px solid #f3f3f3;
						border-top: 3px solid #667eea;
						border-radius: 50%;
						width: 40px;
						height: 40px;
						animation: spin 1s linear infinite;
						margin: 20px auto;
					}
					@keyframes spin {
						0% { transform: rotate(0deg); }
						100% { transform: rotate(360deg); }
					}
					.error { color: #e74c3c; }
					.success { color: #27ae60; }
					.hidden { display: none; }
					a {
						display: inline-block;
						margin-top: 20px;
						padding: 12px 24px;
						background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
						color: white;
						text-decoration: none;
						border-radius: 5px;
						font-weight: 600;
					}
				</style>
			</head>
			<body>
				<div class="container">
					<div id="loading">
						<h1>🔐 Verifying Your Magic Link</h1>
						<div class="spinner"></div>
						<p>Please wait while we log you in...</p>
					</div>
					
					<div id="success" class="hidden">
						<h1 class="success">✅ Success!</h1>
						<p>You have been successfully logged in.</p>
						<p>Redirecting to the application...</p>
					</div>
					
					<div id="error" class="hidden">
						<h1 class="error">❌ Verification Failed</h1>
						<p id="errorMessage">This magic link is invalid or has expired.</p>
						<a href="/magic-link-ui">Request a new link</a>
					</div>
				</div>
				
				<script src="/magic-link-ui/verify.js"></script>
			</body>
			</html>
		`;
		
		res.type('html');
		res.send(processingHtml);
	});
});
