const url = "https://wsbmowporxjagetqxtec.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzYm1vd3BvcnhqYWdldHF4dGVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NDYwOTQsImV4cCI6MjA5ODUyMjA5NH0._Ekxyset3TgM8O6LS30PZO1AD-wfMzT53AuerytCT9M";

fetch(`${url}/rest/v1/installment_templates?select=*`, {
  headers: {
    'apikey': key,
    'Authorization': `Bearer ${key}`
  }
})
.then(res => res.json())
.then(data => {
  console.log("Current installment_templates in Supabase:", JSON.stringify(data, null, 2));
})
.catch(err => console.error("Error fetching installment_templates:", err));
