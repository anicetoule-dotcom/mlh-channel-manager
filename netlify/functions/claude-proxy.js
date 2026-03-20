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
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Methode non autorisee" }) };
  }

  var body;
  try {
    body = JSON.parse(event.body);
  } catch(e) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "JSON invalide: " + e.message }) };
  }

  var apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Cle API manquante dans Netlify" }) };
  }

  var systemPrompt = "Tu es un expert en extraction de donnees de reservations Booking.com. Extrait TOUTES les reservations et reponds UNIQUEMENT avec ce JSON: {\"reservations\":[{\"guestName\":\"Nom\",\"propertyId\":\"mar1\",\"checkIn\":\"YYYY-MM-DD\",\"checkOut\":\"YYYY-MM-DD\",\"amount\":\"154224\",\"status\":\"confirmed\",\"phone\":\"\",\"notes\":\"\"}]}. Regles: dates francaises -> format YYYY-MM-DD, montants -> chiffres uniquement, meme une seule reservation -> retourner dans tableau, UNIQUEMENT le JSON.";

  if (body.system) {
    systemPrompt = body.system;
  }

  if (!body.messages || !Array.isArray(body.messages)) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "messages manquant ou invalide" }) };
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
    var payloadSize = Buffer.byteLength(payload);

    /* Verifier taille - limite Netlify 6MB */
    if (payloadSize > 5 * 1024 * 1024) {
      return {
        statusCode: 413,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Fichier trop volumineux (" + Math.round(payloadSize/1024) + "KB). Max 5MB." })
      };
    }

    var result = await new Promise(function(resolve, reject) {
      var options = {
        hostname: "api.anthropic.com",
        path: "/v1/messages",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Length": payloadSize
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

    /* Si erreur Anthropic, retourner le detail exact */
    if (result.status !== 200) {
      var errBody;
      try { errBody = JSON.parse(result.body); } catch(e) { errBody = { raw: result.body.slice(0, 500) }; }
      var errMsg = (errBody.error && errBody.error.message) ? errBody.error.message : JSON.stringify(errBody).slice(0, 300);
      return {
        statusCode: result.status,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Anthropic " + result.status + ": " + errMsg })
      };
    }

    return {
      statusCode: 200,
      headers: Object.assign({ "Content-Type": "application/json" }, corsHeaders),
      body: result.body
    };

  } catch(err) {
    return {
      statusCode: 502,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Erreur reseau: " + err.message })
    };
  }
};
