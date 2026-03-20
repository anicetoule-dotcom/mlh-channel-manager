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
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "API key not configured" }) };
  }

  /* Si c'est une requete d'import de fichier, on injecte un meilleur system prompt */
  var isImport = body.import_mode === true;
  var systemPrompt = body.system;

  if (isImport) {
    systemPrompt = "Tu es un expert en extraction de donnees de reservations hoteliers depuis Booking.com.\n\nTon role: analyser une image ou un texte provenant de Booking.com Pulse et extraire TOUTES les reservations visibles.\n\nLes captures peuvent montrer:\n- Une liste de reservations (plusieurs clients visibles)\n- Le detail d'une seule reservation (nom, dates, montant visible)\n- Un export CSV ou Excel\n\nPour chaque reservation trouvee, extrait:\n- guestName: nom complet du client\n- propertyId: utilise l'id de la propriete la plus proche parmi celles disponibles (fourni dans le message)\n- checkIn: date arrivee au format YYYY-MM-DD\n- checkOut: date depart au format YYYY-MM-DD  \n- amount: montant numerique uniquement (ex: 154224), sans symbole\n- status: confirmed, pending, checkin, checkout ou cancelled\n- phone: numero de telephone si visible, sinon vide\n- notes: infos utiles (nombre de nuits, adultes, Genius, type de chambre)\n\nREGLES IMPORTANTES:\n- Si tu vois 'mer. 25 mars 2026' -> checkIn: '2026-03-25'\n- Si tu vois 'XOF 154 224' -> amount: '154224'\n- Si tu vois 'Genius' -> ajoute dans notes\n- Meme si c'est une seule reservation, retourne-la dans le tableau\n- Reponds UNIQUEMENT avec du JSON valide, rien d'autre:\n{\"reservations\":[{\"guestName\":\"\",\"propertyId\":\"\",\"checkIn\":\"\",\"checkOut\":\"\",\"amount\":\"\",\"status\":\"confirmed\",\"phone\":\"\",\"notes\":\"\"}]}";
  }

  try {
    var https = require("https");
    
    var requestBody = {
      model: body.model || "claude-sonnet-4-20250514",
      max_tokens: body.max_tokens || 1500,
      messages: body.messages
    };
    
    if (systemPrompt) {
      requestBody.system = systemPrompt;
    }

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
      body: JSON.stringify({ error: "Failed to reach Anthropic: " + err.message })
    };
  }
};
