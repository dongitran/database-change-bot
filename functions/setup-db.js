const { Client } = require("pg");

exports.setupDatabase = async (config) => {
  const client = new Client(config);
  await client.connect();

  const createFilterFunctionSQL = `
    CREATE OR REPLACE FUNCTION filter_row_data(row_data jsonb) RETURNS jsonb AS $$
    DECLARE
        key text;
        value text;
        result jsonb := '{}';
    BEGIN
        FOR key IN SELECT jsonb_object_keys(row_data)
        LOOP
            value := row_data->>key;
            IF length(value) <= 128 THEN
                result := result || jsonb_build_object(key, value);
            END IF;
        END LOOP;
        RETURN result;
    END;
    $$ LANGUAGE plpgsql;
  `;
  await client.query(createFilterFunctionSQL);

  const createFunctionSQL = `
    CREATE OR REPLACE FUNCTION notify_change()
    RETURNS TRIGGER AS $$
    BEGIN
        IF (TG_OP = 'DELETE') THEN
            PERFORM pg_notify('tbl_changes', json_build_object(
                'action', 'delete',
                'table_name', TG_TABLE_NAME,
                'database_name', current_database(),
                'data', filter_row_data(row_to_json(OLD)::jsonb)
            )::text);
        ELSIF (TG_OP = 'UPDATE') THEN
            PERFORM pg_notify('tbl_changes', json_build_object(
                'action', 'update',
                'table_name', TG_TABLE_NAME,
                'database_name', current_database(),
                'new_data', filter_row_data(row_to_json(NEW)::jsonb),
                'old_data', filter_row_data(row_to_json(OLD)::jsonb)
            )::text);
        ELSE
            PERFORM pg_notify('tbl_changes', json_build_object(
                'action', TG_OP,
                'table_name', TG_TABLE_NAME,
                'database_name', current_database(),
                'data', filter_row_data(row_to_json(NEW)::jsonb)
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
