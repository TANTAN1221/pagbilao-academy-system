const url = "https://wsbmowporxjagetqxtec.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzYm1vd3BvcnhqYWdldHF4dGVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NDYwOTQsImV4cCI6MjA5ODUyMjA5NH0._Ekxyset3TgM8O6LS30PZO1AD-wfMzT53AuerytCT9M";

async function testInsert() {
  const row = {
    title: "1st Quarter Installment",
    school_year: "2026-2027",
    percent_of_net: 25,
    due_date: "2026-10-15",
    sort_order: 1,
    active: true
  };

  const res = await fetch(`${url}/rest/v1/installment_templates`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(row)
  });

  const result = await res.json();
  console.log("Insert result (HTTP " + res.status + "):", result);
}

testInsert();
