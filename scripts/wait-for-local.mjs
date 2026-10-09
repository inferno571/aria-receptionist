const deadline = Date.now() + 60000;
while (Date.now() < deadline) {
  try {
    const response = await fetch("http://127.0.0.1:5173/api/auth/get-session", { signal: AbortSignal.timeout(3000) });
    if (response.ok) process.exit(0);
  } catch {}
  await new Promise(resolve => setTimeout(resolve, 1000));
}
throw new Error("Local Aria server did not become ready within 60 seconds.");
