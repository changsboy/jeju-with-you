import { defineConfig, devices } from '@playwright/test';
export default defineConfig({testDir:'./tests',testMatch:'**/*.spec.js',use:{baseURL:'http://127.0.0.1:4173',...devices['iPhone 13'],defaultBrowserType:'chromium'},webServer:{command:'npm run dev -- --host 127.0.0.1 --port 4173',url:'http://127.0.0.1:4173',reuseExistingServer:false}});
