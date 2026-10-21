PHASE 1 — MARKETING, LEAD GENERATION & ANALYTICS INFRASTRUCTURE AUDIT
PROJECT
Body & Sleeves
Production site: bodyandsleeves.com

This is an EXISTING Next.js application.

Do NOT rebuild the application.

Do NOT redesign the storefront.

Do NOT install packages.

Do NOT modify files.

Do NOT create database migrations.

This phase is AUDIT ONLY.

The purpose is to determine what marketing, analytics, SEO, lead-generation, attribution, and conversion infrastructure already exists before anything new is implemented.

STRATEGIC CONTEXT
Body & Sleeves is one of several websites that will eventually be managed by a centralized AI-powered marketing and lead-generation system.

Therefore, during this audit, distinguish between:

functionality that must remain SITE-SPECIFIC;

functionality that could eventually be controlled by a CENTRAL MARKETING AGENT;

functionality that requires an EXTERNAL PLATFORM/API;

functionality that does not currently exist.

Do not implement the centralized agent in this phase.

1. APPLICATION INSPECTION
Determine and report:

Next.js version

App Router or Pages Router

TypeScript status

package manager

deployment architecture if identifiable

environment variable structure

database/provider if present

authentication provider if present

ecommerce/cart architecture

checkout/payment provider

email provider

product/catalog architecture

CMS/content architecture, if any

Do not expose secret values.

Report environment variable NAMES only.

2. GOOGLE ANALYTICS AUDIT
Search the entire project for:

Google Analytics

GA4

Google Tag Manager

gtag

Google measurement IDs

analytics components

tracking scripts

page-view tracking

ecommerce events

Determine whether the application currently tracks:

page_view

view_item

view_item_list

select_item

add_to_cart

remove_from_cart

view_cart

begin_checkout

add_shipping_info

add_payment_info

purchase

search

sign_up

generate_lead

Report:

IMPLEMENTED
PARTIAL
NOT IMPLEMENTED
UNKNOWN

Do not add tracking.

3. GOOGLE SEARCH CONSOLE AUDIT
Determine whether Search Console verification appears to exist through:

HTML meta verification

DNS-related documentation/configuration

verification file

Google Tag Manager

Google Analytics

Also inspect whether the site provides:

sitemap.xml

dynamic sitemap

robots.txt

canonical URLs

index/noindex controls

Report findings.

4. SEO AUDIT
Inspect the existing Next.js implementation for:

Metadata API

page titles

meta descriptions

canonical URLs

Open Graph metadata

Twitter/X metadata

product metadata

category metadata

collection metadata

article/blog metadata

structured data

JSON-LD

Product schema

Organization schema

WebSite schema

BreadcrumbList schema

Article schema

FAQ schema where appropriate

Determine whether metadata is:

STATIC

or

DYNAMIC FROM PRODUCT/CONTENT DATA.

Identify SEO gaps but DO NOT modify them.

5. SOCIAL / ADVERTISING TRACKING AUDIT
Search for existing integrations involving:

Meta Pixel

Meta Conversions API

Facebook

Instagram

Pinterest Tag

TikTok Pixel

TikTok Events API

Google Ads

Google Merchant Center

Microsoft/Bing

other advertising/tracking platforms

Report what currently exists.

Do not install pixels.

6. LEAD CAPTURE AUDIT
Locate every mechanism that collects visitor/customer information.

Examples:

newsletter forms

account registration

contact forms

discount signup

popup forms

footer signup

checkout email

waitlists

product notifications

abandoned carts

For each lead source report:

PAGE / COMPONENT

DATA COLLECTED

DESTINATION

API/PROVIDER

DATABASE TABLE IF APPLICABLE

DOUBLE-OPT-IN STATUS IF IDENTIFIABLE

MARKETING CONSENT HANDLING

ERROR HANDLING

SUCCESS HANDLING

7. EMAIL MARKETING AUDIT
Determine whether the project integrates with:

MailerLite

Resend

Mailchimp

Klaviyo

Brevo

ConvertKit

SendGrid

another provider

Determine whether these capabilities exist:

newsletter subscription

welcome email

lead magnet

first-purchase incentive

abandoned-cart email

post-purchase email

product recommendation email

customer re-engagement

transactional email

marketing segmentation

Report only.

8. ATTRIBUTION / UTM AUDIT
Determine whether the application captures or persists:

utm_source

utm_medium

utm_campaign

utm_content

utm_term

referrer

landing page

first-touch source

last-touch source

session identifiers

customer identifiers

order attribution

Determine whether attribution survives:

landing page → browsing → cart → checkout → completed order

Report what is currently possible.

Do not implement attribution yet.

9. ECOMMERCE CONVERSION FUNNEL
Map the actual existing customer funnel from code.

Example:

Visitor
↓
Landing Page
↓
Product/Collection
↓
Product Detail
↓
Add to Cart
↓
Cart
↓
Checkout
↓
Payment
↓
Order
↓
Fulfillment

Use the REAL implementation found in this repository.

For every stage identify whether analytics/conversion events currently exist.

10. PRODUCT FEED READINESS
Determine whether the current catalog could support feeds for:

Google Merchant Center

Meta Catalog

Pinterest Catalog

TikTok Catalog

Inspect whether product data includes sufficient fields such as:

stable product ID

title

description

URL

image URL

price

currency

availability

brand

condition

category

variant

size

color

Do not create feeds.

Report gaps.

11. CONTENT / ORGANIC ACQUISITION READINESS
Inspect whether the site supports:

blog/articles

landing pages

collections

categories

campaign pages

dynamic SEO pages

internal linking

related products

related articles

Determine how easily an external AI marketing agent could eventually create or update content WITHOUT being given unrestricted access to the application source code.

Report potential integration points only.

12. CENTRAL AI MARKETING AGENT READINESS
This section is important.

Body & Sleeves will eventually be one website among several managed by a centralized AI marketing system.

Evaluate what APIs or interfaces would be needed for an external agent to safely perform actions such as:

read site analytics

read Search Console data

inspect traffic

inspect conversions

identify high-performing products

identify poorly performing products

monitor SEO

discover keyword opportunities

generate content recommendations

generate campaign recommendations

create draft content

publish approved content

generate social content

create UTM campaign URLs

monitor leads

analyze conversion funnels

recommend merchandising changes

DO NOT implement this agent.

Instead classify each capability as:

SITE API REQUIRED

EXTERNAL API AVAILABLE

DATABASE ACCESS REQUIRED

NO SITE INTEGRATION REQUIRED

HUMAN APPROVAL RECOMMENDED

13. MULTI-SITE ARCHITECTURE OBSERVATIONS
Without implementing anything, identify which capabilities should eventually be reusable across multiple websites.

Consider a future architecture similar to:

CENTRAL AI MARKETING PLATFORM

    ↓
SITE REGISTRY

    ↓
Body & Sleeves
CountyBuys
Life Legacy Collective
Other Sites
    ↓
SITE CONNECTORS

    ↓
Analytics
Search Console
Email
SEO
Content
Products
Orders
Leads
Social Channels

Do NOT assume every website uses the same technology.

Identify what should be standardized versus site-specific.

SECURITY REQUIREMENTS
The future marketing agent must NOT require unrestricted production database credentials or unrestricted source-code access.

During the audit, identify opportunities for:

scoped APIs

read-only APIs

service accounts

OAuth

least-privilege access

approval workflows

audit logs

per-site credentials

credential rotation

Never output secret values.

REQUIRED OUTPUT
Create:

PHASE-1-MARKETING-INFRASTRUCTURE-AUDIT.md

The report must contain:

Executive Summary
Current Technology Stack
Existing Marketing Infrastructure
Analytics Status
SEO Status
Search Console Status
Lead Capture Status
Email Marketing Status
Attribution Status
Ecommerce Conversion Tracking
Product Feed Readiness
Organic Content Readiness
Social/Advertising Integration Status
Central AI Agent Readiness
Multi-Site Reusability Assessment
Security Considerations
Missing Capabilities
Recommended Implementation Order
Files Inspected
Environment Variable Names Detected
No-Change Verification
Finish with:

AUDIT RESULT: COMPLETE / INCOMPLETE

and explicitly confirm:

NO APPLICATION CODE WAS MODIFIED.