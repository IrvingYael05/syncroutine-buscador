const express = require("express");
const cors = require("cors");
const { Client } = require("@elastic/elasticsearch");

const app = express();
app.use(cors());
app.use(express.json());

// Se conecta al Elasticsearch de la nube (Bonsai)
const client = new Client({ node: process.env.ELASTIC_URL });
const indexName = "bloques_rutinas";

async function garantizarIndice() {
  const { body: exists } = await client.indices.exists({ index: indexName });
  if (!exists) {
    console.log(
      `Creando el índice '${indexName}' con configuración mínima en Bonsai...`,
    );
    await client.indices.create({
      index: indexName,
      body: {
        settings: {
          number_of_shards: 1,
          number_of_replicas: 0,
        },
      },
    });
    console.log("Índice creado exitosamente.");
  }
}

// 1. ENDPOINT DE SINCRONIZACIÓN (Webhook de Supabase)
app.post("/sync", async (req, res) => {
  try {
    await garantizarIndice();

    const { type, record } = req.body;

    if (type === "INSERT" || type === "UPDATE") {
      await client.index({
        index: indexName,
        id: record.id.toString(),
        body: {
          user_id: record.user_id,
          nombre: record.nombre,
          es_aleatorio: record.es_aleatorio,
        },
      });
    } else if (type === "DELETE") {
      await client.delete({ index: indexName, id: record.id.toString() });
    }

    await client.indices.refresh({ index: indexName });
    res.status(200).send("OK: Elasticsearch sincronizado");
  } catch (error) {
    console.error("Error sync:", error);
    res.status(500).send(error.message);
  }
});

// 2. ENDPOINT DE BÚSQUEDA (Frontend en Angular)
app.get("/search", async (req, res) => {
  const { q, user_id } = req.query;

  if (!q || !user_id) return res.json([]);

  try {
    await garantizarIndice();

    const { body } = await client.search({
      index: indexName,
      body: {
        query: {
          bool: {
            must: [
              { match: { user_id: user_id } },
              {
                multi_match: {
                  query: q,
                  fields: ["nombre"],
                  fuzziness: "AUTO",
                },
              },
            ],
          },
        },
      },
    });

    const hits = body.hits.hits.map((hit) => hit._source);
    res.json(hits);
  } catch (error) {
    console.error("Error en búsqueda:", error);
    res.status(500).json({ error: "Error interno del buscador" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Buscador activo y esperando webhooks en el puerto ${PORT}`);
});
