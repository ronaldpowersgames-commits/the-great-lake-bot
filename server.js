@@
-    console.log('  Model       : claude-sonnet-4-5');
+    console.log('  Model       : gpt-4o');
@@
-  res.status(200).json({
-    name: config.appName,
-    status: 'healthy',
-    version: '1.3.0',
-    timestamp: new Date().toISOString(),
-    governance: 'Rules 1–27 active',
-    lake: 'Still waters — ready to reflect',
-  });
+  res.status(200).json({
+    name: config.appName,
+    status: 'healthy',
+    version: '1.3.0',
+    timestamp: new Date().toISOString(),
+    governance: 'Rules 1–27 active',
+    lake: 'Still waters — ready to reflect',
+    model: 'gpt-4o'
+  });
@@
-// Keep alive — prevent Render from sleeping
-setInterval(() => {
-  fetch('https://the-great-lake-bot.onrender.com/health')
-    .catch(() => {});
-}, 14 * 60 * 1000); // ✅ fixed *
+// Keep alive — prevent Render from sleeping
+setInterval(() => {
+  fetch('https://the-great-lake-bot.onrender.com/health')
+    .catch(() => {});
+}, 14 * 60 * 1000); // ✅ fixed *
