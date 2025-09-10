import { defineModule } from '@directus/extensions-sdk';
import ModuleComponent from './module.vue';

export default defineModule({
	id: 'magic-link',
	name: 'Magic Link',
	icon: 'mail',
	routes: [
		{
			path: '',
			component: ModuleComponent,
		},
	],
	preRegisterCheck() {
		// Always allow access - this makes the module public
		return true;
	},
	hidden: true, // Hide from main navigation since it's a public auth page
});
