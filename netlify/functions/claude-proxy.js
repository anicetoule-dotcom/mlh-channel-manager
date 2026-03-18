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

  try {
    var https = require("https");
    var payload = JSON.stringify({
      model: body.model || "claude-sonnet-4-20250514",
      max_tokens: body.max_tokens || 1024,
      messages: body.messages,
      system: body.system || undefined
    });

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
