<template>
	<public-view>
		<div class="magic-link-container">
			<h1>🔐 Magic Link Login</h1>
			<p>Enter your email to receive a secure login link</p>
			
			<div v-if="successMessage" class="message success">
				{{ successMessage }}
			</div>
			<div v-if="errorMessage" class="message error">
				{{ errorMessage }}
			</div>
			
			<form @submit.prevent="requestMagicLink" class="magic-link-form">
				<input 
					v-model="email" 
					type="email" 
					placeholder="your@email.com" 
					required
					autocomplete="email"
					:disabled="loading"
				/>
				<button type="submit" :disabled="loading || !email">
					{{ loading ? 'Sending...' : 'Send Magic Link' }}
				</button>
			</form>
		</div>
	</public-view>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue';

export default defineComponent({
	setup() {
		const email = ref('');
		const loading = ref(false);
		const successMessage = ref('');
		const errorMessage = ref('');

		const requestMagicLink = async () => {
			loading.value = true;
			successMessage.value = '';
			errorMessage.value = '';

			try {
				const response = await fetch('/server/magic-link-api/generate', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						email: email.value,
						redirectUrl: `https://${window.location.host}/server/admin/magic-link/verify`
					}),
				});

				const data = await response.json();

				if (data.success) {
					successMessage.value = data.message || 'Check your email for the magic link!';
					email.value = '';
				} else {
					errorMessage.value = data.message || 'Something went wrong. Please try again.';
				}
			} catch (error) {
				errorMessage.value = 'Network error. Please check your connection and try again.';
			} finally {
				loading.value = false;
			}
		};

		return {
			email,
			loading,
			successMessage,
			errorMessage,
			requestMagicLink
		};
	}
});
</script>

<style scoped>
.magic-link-container {
	max-width: 400px;
	margin: 2rem auto;
	padding: 2rem;
	text-align: center;
}

h1 {
	color: var(--theme--primary);
	margin-bottom: 0.5rem;
	font-size: 1.5rem;
}

p {
	color: var(--theme--foreground-subdued);
	margin-bottom: 2rem;
	font-size: 0.875rem;
}

.magic-link-form {
	display: flex;
	flex-direction: column;
	gap: 1rem;
}

input[type="email"] {
	padding: 0.75rem 1rem;
	border: 1px solid var(--theme--border-color);
	border-radius: var(--theme--border-radius);
	font-size: 1rem;
	background: var(--theme--background);
	color: var(--theme--foreground);
}

input[type="email"]:focus {
	outline: none;
	border-color: var(--theme--primary);
}

button {
	padding: 0.75rem;
	background: var(--theme--primary);
	color: var(--theme--primary-foreground);
	border: none;
	border-radius: var(--theme--border-radius);
	font-size: 1rem;
	font-weight: 600;
	cursor: pointer;
	transition: background-color 0.2s;
}

button:hover:not(:disabled) {
	background: var(--theme--primary-accent);
}

button:disabled {
	opacity: 0.6;
	cursor: not-allowed;
}

.message {
	padding: 0.75rem;
	border-radius: var(--theme--border-radius);
	margin-bottom: 1rem;
	font-size: 0.875rem;
}

.success {
	background: var(--theme--success-background);
	color: var(--theme--success);
	border: 1px solid var(--theme--success-border);
}

.error {
	background: var(--theme--danger-background);
	color: var(--theme--danger);
	border: 1px solid var(--theme--danger-border);
}
</style>
