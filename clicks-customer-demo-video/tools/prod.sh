#!/usr/bin/env bash
# Production API helpers for demo capture. Read-mostly; writes only demo rows.
API="https://clicks-tech-api-production.up.railway.app"
ADMIN_API="https://clicks-admin-api-production.up.railway.app"
CUST_PHONE="+97433333333"
CUST_PASS="Customer123!"
TECH_PHONE="+97411111111"
TECH_PASS="Tech123!"
ADMIN_EMAIL="admin@clicks.local"
ADMIN_PASS="Admin123!"
J() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.stringify(JSON.parse(s),null,1).slice(0,$1||4000))}catch(e){console.log(s.slice(0,1200))}})"; }
