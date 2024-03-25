const { Client } = require("pg");

exports.setupDatabase = async (config) => {
  const client = new Client(config);
  await client.connect();

  const createFilterFunctionSQL = `
    CREATE OR REPLACE FUNCTION filter_large_data(data JSON) RETURNS JSON AS $$
    DECLARE
        result JSONB := '{}'::jsonb;
        value TEXT;
        key TEXT;
        id_value TEXT;
    BEGIN
        id_value := data->>'id';

        IF octet_length(data::text) > 7000 THEN
            FOR key IN SELECT json_object_keys(data)
            LOOP
                value := data->>key;
                IF value IS NOT NULL AND octet_length(value) < 700 THEN
                    result := jsonb_set(result, ARRAY[key], to_jsonb(value)::jsonb);
                ELSEIF value IS NOT NULL THEN
                    result := jsonb_set(result, ARRAY[key], '"large size"'::jsonb);
                ELSE
                    result := jsonb_set(result, ARRAY[key], 'null'::jsonb);
                END IF;
            END LOOP;

            IF octet_length(result::text) > 7000 THEN
                RETURN jsonb_build_object('id', id_value);
            ELSE
                RETURN result::json;
            END IF;
        ELSE
            RETURN data;
        END IF;
    END;
    $$ LANGUAGE plpgsql;
  `;
  await client.query(createFilterFunctionSQL);

  const createFunctionSQL = `
    CREATE OR REPLACE FUNCTION notify_change()
    RETURNS TRIGGER AS $$
    DECLARE
        changed_data JSONB;
    BEGIN
        IF (TG_OP = 'DELETE') THEN
            PERFORM pg_notify('tbl_changes', json_build_object(
                'action', 'delete',
                'table_name', TG_TABLE_NAME,
                'database_name', current_database(),
                'data', filter_large_data(row_to_json(OLD)::json)
            )::text);
        ELSIF (TG_OP = 'UPDATE') THEN
            changed_data := (SELECT jsonb_object_agg(key, value) 
                FROM jsonb_each(row_to_json(NEW)::jsonb) 
                WHERE key = 'id' OR value IS DISTINCT FROM jsonb_extract_path(row_to_json(OLD)::jsonb, key));

            PERFORM pg_notify('tbl_changes', json_build_object(
                'action', 'update',
                'table_name', TG_TABLE_NAME,
                'database_name', current_database(),
                'new_data', filter_large_data(changed_data::json)
            )::text);
        ELSE
            PERFORM pg_notify('tbl_changes', json_build_object(
                'action', TG_OP,
                'table_name', TG_TABLE_NAME,
                'database_name', current_database(),
                'data', filter_large_data(row_to_json(NEW)::json)
            )::text);
        END IF;
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `;
  await client.query(createFunctionSQL);

  const tablesRes = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
  `);

  for (let row of tablesRes.rows) {
    const tableName = row.table_name;
    const triggerName = `trigger_${tableName}_change`;
    await client.query(`
      DROP TRIGGER IF EXISTS ${triggerName} ON ${tableName};
      CREATE TRIGGER ${triggerName}
      AFTER INSERT OR UPDATE OR DELETE ON ${tableName}
      FOR EACH ROW EXECUTE FUNCTION notify_change();
    `);
  }

  console.log("Database setup complete with triggers for all tables.");
  return client;
};
