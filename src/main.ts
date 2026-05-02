import './style.css';
import 'highlight.js/styles/github-dark.css';
import { store } from './state';
import { mount } from './ui';

const root = document.getElementById('app')!;

(async () => {
  await store.init();
  mount(root);
})();
