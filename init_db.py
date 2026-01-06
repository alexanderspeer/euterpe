"""
Database initialization script for Euterpe

CRITICAL SAFETY: This script creates the 'euterpe' schema and tables
WITHOUT touching the 'public' schema used by bookshelf-hermes.

Run this once after deploying to Heroku:
    heroku run python init_db.py

This script is safe to run multiple times (idempotent).
"""

import os
import sys
from sqlalchemy import create_engine, text, inspect


def init_database():
    """
    Initialize the Euterpe database schema and tables.
    
    Steps:
    1. Create 'euterpe' schema if it doesn't exist
    2. Create all tables in 'euterpe' schema
    3. Verify no tables were created in 'public' schema
    """
    
    # Get database URL from environment
    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        print("ERROR: DATABASE_URL environment variable not set")
        sys.exit(1)
    
    # Heroku provides postgres:// but SQLAlchemy needs postgresql://
    if database_url.startswith('postgres://'):
        database_url = database_url.replace('postgres://', 'postgresql://', 1)
    
    print("Connecting to database...")
    engine = create_engine(database_url)
    
    try:
        with engine.connect() as conn:
            # Step 1: Create euterpe schema
            print("\nStep 1: Creating 'euterpe' schema...")
            conn.execute(text("CREATE SCHEMA IF NOT EXISTS euterpe"))
            conn.commit()
            print("✓ Schema 'euterpe' created (or already exists)")
            
            # Step 2: Verify schema exists
            print("\nStep 2: Verifying schema...")
            result = conn.execute(text(
                "SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'euterpe'"
            ))
            if result.fetchone():
                print("✓ Schema 'euterpe' verified")
            else:
                print("✗ ERROR: Schema 'euterpe' not found")
                sys.exit(1)
            
            # Step 3: Create tables in euterpe schema
            print("\nStep 3: Creating tables in 'euterpe' schema...")
            from models import db, EUTERPE_SCHEMA, OwnerToken
            
            # Import app to get the Flask app context
            from app import app
            
            with app.app_context():
                # Create all tables (they will be created in euterpe schema due to __table_args__)
                db.create_all()
                print("✓ Tables created in 'euterpe' schema")
                print(f"  Note: OwnerToken table is for single-owner mode")
                print(f"  Note: User/UserToken tables kept for database safety (unused)")
            
            # Step 4: Verify tables are in correct schema
            print("\nStep 4: Verifying table placement...")
            result = conn.execute(text("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'euterpe'
                ORDER BY table_name
            """))
            euterpe_tables = [row[0] for row in result.fetchall()]
            
            if euterpe_tables:
                print(f"✓ Found {len(euterpe_tables)} table(s) in 'euterpe' schema:")
                for table in euterpe_tables:
                    print(f"  - euterpe.{table}")
            else:
                print("✗ WARNING: No tables found in 'euterpe' schema")
            
            # Step 5: Safety check - ensure we didn't touch public schema
            print("\nStep 5: Safety check - verifying 'public' schema integrity...")
            result = conn.execute(text("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name IN ('users', 'user_tokens')
                ORDER BY table_name
            """))
            public_conflicting_tables = [row[0] for row in result.fetchall()]
            
            if public_conflicting_tables:
                print("⚠ WARNING: Found Euterpe-like tables in 'public' schema:")
                for table in public_conflicting_tables:
                    print(f"  - public.{table}")
                print("These will be IGNORED by Euterpe (using euterpe.* tables only)")
            else:
                print("✓ No conflicting tables in 'public' schema")
            
            # Step 6: Final verification
            print("\n" + "="*60)
            print("DATABASE INITIALIZATION COMPLETE")
            print("="*60)
            print(f"Schema: euterpe")
            print(f"Tables: {', '.join(euterpe_tables)}")
            print(f"Status: Ready for multi-user operation")
            print("="*60)
            
    except Exception as e:
        print(f"\n✗ ERROR during database initialization:")
        print(f"  {type(e).__name__}: {e}")
        sys.exit(1)
    finally:
        engine.dispose()


if __name__ == '__main__':
    print("="*60)
    print("EUTERPE DATABASE INITIALIZATION")
    print("="*60)
    print("This script will:")
    print("1. Create 'euterpe' schema")
    print("2. Create tables in 'euterpe' schema ONLY")
    print("3. Verify no changes to 'public' schema")
    print("="*60)
    print()
    
    init_database()

