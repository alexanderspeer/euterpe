"""
Database models for Euterpe - Multi-user Spotify Analytics

CRITICAL: All tables MUST be in the 'euterpe' schema to avoid conflicts
with the shared database (bookshelf-hermes uses 'public' schema).
"""

from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timezone
import uuid

db = SQLAlchemy()

# Schema name for all Euterpe tables - NEVER use 'public'
EUTERPE_SCHEMA = "euterpe"


class User(db.Model):
    """
    User model - stores Spotify user information
    Schema: euterpe (isolated from other apps)
    """
    __tablename__ = 'users'
    __table_args__ = {'schema': EUTERPE_SCHEMA}
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    spotify_user_id = db.Column(db.String(255), unique=True, nullable=False, index=True)
    display_name = db.Column(db.String(255), nullable=False)
    email = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    
    # One-to-one relationship with UserToken
    token = db.relationship('UserToken', backref='user', uselist=False, cascade='all, delete-orphan')
    
    def __repr__(self):
        return f'<User {self.display_name} ({self.spotify_user_id})>'


class UserToken(db.Model):
    """
    UserToken model - stores encrypted Spotify OAuth tokens
    Schema: euterpe (isolated from other apps)
    
    SECURITY: All tokens are encrypted at rest using Fernet encryption.
    Never store plaintext tokens.
    
    NOTE: This table is kept for database safety (shared DB) but is no longer
    used in single-owner mode. See OwnerToken instead.
    """
    __tablename__ = 'user_tokens'
    __table_args__ = {'schema': EUTERPE_SCHEMA}
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(
        db.String(36),
        db.ForeignKey(f'{EUTERPE_SCHEMA}.users.id'),
        unique=True,
        nullable=False,
        index=True
    )
    
    # Encrypted tokens - NEVER store plaintext
    access_token_encrypted = db.Column(db.Text, nullable=False)
    refresh_token_encrypted = db.Column(db.Text, nullable=False)
    
    # Token metadata
    expires_at = db.Column(db.DateTime, nullable=False)
    token_type = db.Column(db.String(50), default='Bearer', nullable=False)
    scope = db.Column(db.Text, nullable=True)
    
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    
    def __repr__(self):
        return f'<UserToken for user_id={self.user_id}, expires_at={self.expires_at}>'


class OwnerToken(db.Model):
    """
    OwnerToken model - stores the single owner's encrypted Spotify OAuth tokens
    Schema: euterpe (isolated from other apps)
    
    This table contains exactly ONE row for the site owner's Spotify credentials.
    Public visitors use the owner's token to view data without authenticating.
    
    SECURITY: All tokens are encrypted at rest using Fernet encryption.
    Never store plaintext tokens.
    """
    __tablename__ = 'owner_tokens'
    __table_args__ = {'schema': EUTERPE_SCHEMA}
    
    id = db.Column(db.String(36), primary_key=True, default='owner')
    
    # Encrypted tokens - NEVER store plaintext
    access_token_encrypted = db.Column(db.Text, nullable=False)
    refresh_token_encrypted = db.Column(db.Text, nullable=False)
    
    # Token metadata
    expires_at = db.Column(db.DateTime, nullable=False)
    token_type = db.Column(db.String(50), default='Bearer', nullable=False)
    scope = db.Column(db.Text, nullable=True)
    
    # Owner info (for display)
    spotify_user_id = db.Column(db.String(255), nullable=True)
    display_name = db.Column(db.String(255), nullable=True)
    
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    
    def __repr__(self):
        return f'<OwnerToken id={self.id}, expires_at={self.expires_at}>'

