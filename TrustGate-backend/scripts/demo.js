import assert from "node:assert/strict";

const api = `http://127.0.0.1:${process.env.PORT ?? 3000}`;

async function post(path, body, token) {
  const response = await fetch(api + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

try {
  const [intern, admin] = await Promise.all(
    ["intern", "admin"].map((role) => post("/api/demo/session", { role }))
  );
  assert.equal(intern.status, 201);
  assert.equal(admin.status, 201);

  const budgetQuestion = "What is the confidential budget?";
  const cases = [
    { role: "Intern", token: intern.body.token, message: "What are the office hours?", expected: 200 },
    { role: "Intern", token: intern.body.token, message: budgetQuestion, expected: 403 },
    { role: "Admin", token: admin.body.token, message: budgetQuestion, expected: 200 }
  ];

  for (const { role, token, message, expected } of cases) {
    const result = await post("/api/chat", { message }, token);
    assert.equal(result.status, expected);
    console.log(`${role} | ${message}\n  ${result.status} ${result.body.answer ?? result.body.code}`);
  }

  const audit = await fetch(`${api}/api/audit`, {
    headers: { Authorization: `Bearer ${admin.body.token}` }
  });
  assert.equal(audit.status, 200);
  const { events } = await audit.json();
  console.log("\nAdmin audit log | latest access decisions");
  console.table(events.slice(0, cases.length));
} catch (error) {
  console.error(error.cause?.code === "ECONNREFUSED"
    ? "Start the backend first with npm start in another terminal."
    : error.message);
  process.exitCode = 1;
}
