exports.handler = async function(event, context) {
  var corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  var body;
  try {
    body = JSON.parse(event.body);
  } catch(e) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  var apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Cle API manquante - verifiez les variables d environnement Netlify" }) };
  }

  var systemPrompt = "Tu es un expert en extraction de donnees de reservations depuis Booking.com Pulse.\n\nExtrait TOUTES les reservations visibles et reponds UNIQUEMENT avec ce JSON valide:\n{\"reservations\":[{\"guestName\":\"Nom complet\",\"propertyId\":\"mar1\",\"checkIn\":\"YYYY-MM-DD\",\"checkOut\":\"YYYY-MM-DD\",\"amount\":\"154224\",\"status\":\"confirmed\",\"phone\":\"\",\"notes\":\"7 nuits 1 adulte\"}]}\n\nREGLES:\n- Dates francaises: 'mer. 25 mars 2026' = '2026-03-25', '1 avr. 2026' = '2026-04-01'\n- Montants: 'XOF 154 224' = '154224', enleve espaces et symboles\n- Status: confirmed si future, checkin si aujourd hui, checkout si part aujourd hui\n- Genius = ajouter dans notes\n- Une seule reservation visible = retourner quand meme dans le tableau\n- Proprietes disponibles seront dans le message utilisateur\n- UNIQUEMENT le JSON, aucun texte avant ou apres";

  if (body.system) {
    systemPrompt = body.system;
  }

  try {
    var https = require("https");

    var requestBody = {
      model: body.model || "claude-sonnet-4-20250514",
      max_tokens: body.max_tokens || 1500,
      system: systemPrompt,
      messages: body.messages
    };

    var payload = JSON.stringify(requestBody);

    var result = await new Promise(function(resolve, reject) {
      var options = {
        hostname: "api.anthropic.com",
        path: "/v1/messages",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Length": Buffer.byteLength(payload)
        }
      };

      var req = https.request(options, function(res) {
        var data = "";
        res.on("data", function(chunk) { data += chunk; });
        res.on("end", function() {
          resolve({ status: res.statusCode, body: data });
        });
      });

      req.on("error", function(e) { reject(e); });
      req.write(payload);
      req.end();
    });

    return {
      statusCode: result.status,
      headers: Object.assign({ "Content-Type": "application/json" }, corsHeaders),
      body: result.body
    };

  } catch(err) {
    return {
      statusCode: 502,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Erreur proxy: " + err.message })
    };
  }
};
