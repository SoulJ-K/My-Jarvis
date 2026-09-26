import { startJarvis } from './app';

// Electron loads the entry module itself; do not gate startup on require.main.
startJarvis();
