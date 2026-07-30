const express = require("express");
const cors = require("cors");
const { Client } = require("@elastic/elasticsearch");

const app = express();
app.use(cors());
app.use(express.json());

// Se conecta al Elasticsearch de la nube (Bonsai)
const client = new Client({ node: process.env.ELASTIC_URL });
const indexName = "bloques_rutinas";

// 1. ENDPOINT DE SINCRONIZACIÓN (Supabase llama aquí)
app.post("/sync", async (req, res) => {
  try {
    const { type, record } = req.body; // Supabase manda la fila de la BD aquí

    if (type === "INSERT" || type === "UPDATE") {
      await client.index({
        index: indexName,
        id: record.id.toString(), // ID real de tu PostgreSQL
        body: {
          user_id: record.user_id, // Guarda de quién es el bloque
          nombre: record.nombre || record.nombre, // Guarda el nombre del bloque
        },
      });
    } else if (type === "DELETE") {
      await client.delete({ index: indexName, id: record.id.toString() });
    }

    // Refrescar índice
    await client.indices.refresh({ index: indexName });
    res.status(200).send("OK: Elasticsearch sincronizado");
  } catch (error) {
    console.error("Error sync:", error);
    res.status(500).send(error.message);
  }
});

// 2. ENDPOINT DE BÚSQUEDA (Angular llama aquí)
app.get("/search", async (req, res) => {
  const { q, user_id } = req.query;

  if (!q || !user_id) return res.json([]);

  try {
    const { body } = await client.search({
      index: indexName,
      body: {
        query: {
          bool: {
            must: [
              { match: { user_id: user_id } }, // Trae la información solo de este usuario
              {
                multi_match: {
                  query: q,
                  fields: ["titulo", "notas"], // Busca en estos campos
                  fuzziness: "AUTO", // Tolera errores ortográficos
                },
              },
            ],
          },
        },
      },
    });

    const hits = resultado.hits.hits.map((hit) => hit._source);
    res.json(hits);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del buscador" });
  }
});

// Arrancar el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Buscador activo en puerto ${PORT}`));
