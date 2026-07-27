What this is: The Visa Digital Benefits Platform (VDBP). Visa provides this tool to card issuing banks for them to configure benefits for their cardholders. 

Figma page for reference: https://www.figma.com/design/3EZYXoSWHrP9sSCIPuwsBT/VDBP?node-id=1830-2941&t=qAQSpwvws22st91E-0

This is a working prototype, created to demonstrate certain features for a redesign of the VDBP. Not all features will be functional. However, all functional features and all data should be realistically represented. The new design features will be rolled out first in Latin America (LatAm), then worldwide. For that reason, the product’s default language is English. Labels, notifications, and functions are to be displayed in English. 

# CONTEXT

A user at an issuing bank, such as Bradesco Bank in Brazil, would configure benefits for users via a benefits page. Benefits are then assigned to a package via a package page. Multiple benefits can be assigned to a single package. Packages are then assigned to Business Identification Numbers (BINs), which correspond to the first 4-6 digits on a credit card. Multiple packages can be assigned to multiple BINs. The BIN assignment is how a cardholder gains access to the Package, and its corresponding benefits. 


## Benefit states

Benefits are first created (unsaved draft state), then saved (saved draft state), then sent for approval by an administrator (pending approval state), then approved by the administrator (published state). An administrator (admin) may also reject the benefit (not approved = rejected state). A benefit may expire if it is not approved by the starting date (expired state). The same is true for packages. 

Each status has a corresponding badge. The colors for each badge style:
-Unsaved Draft and Saved Draft: grey/background + grey/icon + text/inky (for text)
-Pending approval: blue/background + blue/icon + text/inky (for text)
-Rejected; amber/background + amber/icon + text/inky (for text)
-Expired: red/background + red/icon + text/inky (for text)
-Published: green/background + green/icon + text/inky (for text)

See Figma node https://www.figma.com/design/3EZYXoSWHrP9sSCIPuwsBT/VDBP?node-id=1829-150210&t=qAQSpwvws22st91E-4 for badge icons, colors, text, dimensions.



## Hierarchy

This redesign includes a new feature called Hierarchy. Benefits and Packages can have parent-child relationships. There are three levels of hierarchy: Parent (called Base in the product), Child (called Extension level 1 or Extension lvl 1 or Ext lvl1), and grandchild (called Extension level 2 or Extension lvl 2 or Ext lvl2). The logic and reasoning for hierarchical relationships is so that users can create a general template benefit or package, then more specific benefits or packages for different cards, different cardholder groups, different customer types, different benefit-package offerings, different regions or countries, etc. 

A grandchild benefit (ext lvl2) has a parent benefit (ext lvl1) and a grandparent benefit (Base). This relationship hierarchy is also true for packages. 
The relationship of benefits and packages is narrow: A Base benefit can create an extension lvl 1, an extension lvl 1 can create an extension lvl 2. A child cannot create a parent. Unrelated benefits or packages cannot be parents or children of each other. Only a benefit or package that has been created via the hierarchy system from another benefit or package is considered related. 

A package cannot create a child benefit, and a benefit cannot create a child package. The two are separate. 

When created, a child (ext. lvl 1 or ext. lvl 2) will have the same attributes as its parent. The user may change, add, subtract, or otherwise alter information at the page level. It will have a unique identifying number when created. A grandchild benefit or package (ext. lvl2) can be created from a child benefit or package (ext. lvl1). A child benefit or package (ext lvl 1) can be created from a parent benefit or package (Base). Parent (Base) benefits and packages are typically used as templates. Child and grandchild (ext lvl1 and ext lvl2) benefits and packages are typically more specific in their scope and are more often assigned to cardholders. 

Benefit and Package siblings may have children. These are considered all related. 


## Assigning Benefits to Packages

By default, any benefit can be assigned to any package.However, a package containing a child benefit (ext lvl1) cannot have its parent benefit (Base) assigned to the same package after the child benefit (ext lvl1) has already been assigned. A package containing a grandchild benefit (ext lvl2) cannot have its parent benefit (ext lvl1) or grandparent benefit (Base) assigned to the same package. 
A package with a parent benefit (Base) already assigned to it may have its child or grandchild (ext lvl1 or ext lvl2) also assigned to it, but the attribute differences in the child or grandchild benefit will override the parent benefit. The attribute differences in the grandchild (ext lvl2) benefit will also override the attributes of the child (ext lvl1) benefit. 

Unrelated benefits of any level may be assigned to packages if they are not related.


## Menus

Benefits and packages each have a menu page. The benefit menu contains all benefits, the package menu contains all packages. Limitation of what benefits or packages can be viewed in each menu are constrained by the user’s credentials. For example: an admin at Bradesco Bank may only see benefits created by admins and users of Bradesco Bank in the benefits menu. A regional LatAm Visa manager may only see packages assigned to the LatAm region in the packages menu.

The Benefits menu and the Package menu is arranged as a table. Each row of the table represents one individual benefit on the benefits menu, or one individual package on the package menu. 
Clicking a row on either menu will reveal an overlay with details about that individual benefit or package. The overlay may then be closed, or another action can be performed: approve benefit or package, reject benefit or package, add comment (creates a comment viewable within the overlay), or view benefit or package page (navigates to that benefit or package’s page). 

The menu has two action buttons: New Benefit (for the benefit menu) or New Package (for the package menu), and Search (available on both menus). 
The menu page displays a table with 10 rows visible at a time. Below the table, there is pagination for additional pages.

The table for the benefits menu has the following columns: 
-Benefit Name
-Benefit Type
-Benefit ID
-Card Types
-Effective Start
-Effective End
-Hierarchy Level
-Status


## Menu Overlays
(See Figma node https://www.figma.com/design/3EZYXoSWHrP9sSCIPuwsBT/VDBP?node-id=1867-8406&t=qAQSpwvws22st91E-4)

Menu Overlays appear on the menu page when the user clicks a row in the menu table. A dark shader (#000000, 25% opacity) appears behind the overlay to darken the menu page behind it. 

- Overlay is horizontally centered on the page
- Overlay appears 180 pixels from the top of the viewport window
- Overlay fades in over 0.5 seconds
- Dark shader behind overlay: #000000 at 25% opacity
- Overlay closes on: X button click OR click outside overlay
- When closed, overlay fades out over 0.25 seconds
- Overlay action buttons (in a row at the bottom of the overlay, with 36 pixel padding from bottom edge, aligned to the right with 24 pixel padding): Approve, Reject, Add Comment, View benefit page
- Overlay has two tabs: Basic Info, Product Details
- 24 pixels padding left-right, 16 pixels padding top, 36 pixels padding bottom

### Basic Info tab of Overlay:
(See Figma node https://www.figma.com/design/3EZYXoSWHrP9sSCIPuwsBT/VDBP?node-id=1867-8404&t=qAQSpwvws22st91E-4)

Contains: Benefit Name aligned left in font size H2, a large “X” and “Close” aligned right.
Benefit Status, Status Badge, Status Wizard (see Figma node https://www.figma.com/design/3EZYXoSWHrP9sSCIPuwsBT/VDBP?node-id=1830-2941&t=qAQSpwvws22st91E-4). 
Below that, Overlay Tab Navigation (Basic Info, Product Details - see Figma node https://www.figma.com/design/3EZYXoSWHrP9sSCIPuwsBT/VDBP?node-id=1830-2834&t=qAQSpwvws22st91E-4).
Below that, Two Columns:

Column 1:
Benefit ID
Start Date
Core / Optional
Hierarchy level

Version # (with list of versions numbers, each with start and end dates)

Card Type(s)

Relationship Hierarchy (Hierarchy level of selected benefit, below that a list of related benefits).


### Product Details tab of Overlay
(See Figma node https://www.figma.com/design/3EZYXoSWHrP9sSCIPuwsBT/VDBP?node-id=1867-8405&t=qAQSpwvws22st91E-4)

Contains: Benefit Name aligned left in font size H2, a large “X” and “Close” aligned right.
Benefit Status, Status Badge, Status Wizard (see Figma node https://www.figma.com/design/3EZYXoSWHrP9sSCIPuwsBT/VDBP?node-id=1830-2941&t=qAQSpwvws22st91E-4). 
Below that, Overlay Tab Navigation (Basic Info, Product Details - see Figma node https://www.figma.com/design/3EZYXoSWHrP9sSCIPuwsBT/VDBP?node-id=1830-2834&t=qAQSpwvws22st91E-4).
Below that, single column:

Product Groups:

Table with columns: Card Type, Spend Tier IDs, Coverage, Cost
Rows are for each Card Type. One card type per row. 



—


# BENEFIT PAGE STRUCTURE

Benefits have to modes: View mode and Edit mode. Unsaved and Saved Draft benefits always appear in Edit mode. Pending Approval and Published benefits may appear in Edit mode or in View-only mode. View-only mode is the default state for benefits in Pending Approval and Published states. In View mode, all fields are not editable. All fields appear without a downward-facing chevron. The user may not change, alter, add, or subtract any information from the page. In Edit mode, all fields are editable. Some fields appear with a downward-facing chevron (suggesting a drop-down menu on click). 
(See Figma node https://www.figma.com/design/3EZYXoSWHrP9sSCIPuwsBT/VDBP?node-id=1868-9932&t=qAQSpwvws22st91E-4 for Base Benefit - published state not in edit mode (view mode), and Figma node https://www.figma.com/design/3EZYXoSWHrP9sSCIPuwsBT/VDBP?node-id=1868-9931&t=qAQSpwvws22st91E-4 for a child benefit just created from a Base benefit - unsaved draft state, in edit mode)

## Universal: 

Navigation Bar: Top navigation bar is 80 pixels tall. Runs the entire width of the page. Visa logo aligned to left with a 24 pixel padding. Page title: “Visa Digital Benefits Platform” inline with logo with a 16 pixel gap. Aligned to the right with 24 pixel padding: (from left to right) Navigation tabs (Benefits, Packages, More, Admin, Tools), Profile icon, and stacked: A date (MM/DD/YYY. For the purposes of this prototype the year will always be 2024. Do not show a date here beyond 2024. Month and day can be today’s month and today’s day), current time (HH:MM, 24 hour clock, current), region (will always show LatAm). 

All pages have 24 pixel left and right padding. 


## Benefit Title: The name of the benefit as it appears in the benefit menu.
Displayed in H1 font size at the top of the Benefit Page, just below the top navigation bar. 
For child benefits (ext lvl1): append ": Ext. Lvl 1" 
For grandchild benefits (ext lvl2): append ": Ext Lvl 2"


## Actions

A series of buttons the user can click to perform an action. Aligned to the right with a 24 pixel padding (consistent with the rest of the page).
For a benefit in non-edit (view-only) mode, there is: Cancel (closes the benefit page, returns the user to the benefit menu), Duplicate (creates a new version of the benefit with the same ID number), Create Extension (creates a child of the benefit, not available on grandchild - ext lvl2 benefits), Edit (changes page to Edit mode).
For a benefit in edit mode, there is: Cancel, Duplicate, Create Extension, Save Draft (any changes, edits, or alterations to the page will be saved), and Submit (any changes, edits or alterations to the page are saved. If benefit is in Unsaved Draft or Saved draft state, the state is then changed to Pending Approval). 

These action buttons are repeated in the page footer.



## Sidebar
(See Figma node https://www.figma.com/design/3EZYXoSWHrP9sSCIPuwsBT/VDBP?node-id=1834-153814&t=qAQSpwvws22st91E-4 for reference)

Sidebar is 370 pixels wide. Aligned to the left with a 24 pixel padding (consistent with all other elements on the page). The sidebar is persistent and fixed on the page - if follows the page scrolling. When the user scrolls down the page, the sidebar scrolls with it. There is a 24 pixel gutter between the sidebar and the rest of the elements appearing on the page beside it to the right. 


Content:

STATUS:, followed by a status badge
Status wizard 
(See Figma node https://www.figma.com/design/3EZYXoSWHrP9sSCIPuwsBT/VDBP?node-id=1834-138672&t=qAQSpwvws22st91E-4. Logic: Any benefit with a published status shows the corresponding published badge and published state in the wizard. Unsaved and Saved Draft states correspond to the Draft state of the wizard. Pending Approval State badge corresponds with Pending Approval state of the wizard. Any benefit with rejected status must also be in and correspond to pending approval state in the wizard. Expired benefits must show the expired badge, and may correspond with pending approval or published state in the wizard.)

The content below the benefit status and status wizard is contained by a stroke. This content has a border (border/component) of 1 pixel, with an 8 pixel corner radius. 
- Benefit ID: (unique 7-digit number)
- Start Date: (MM/DD/YYY)
- Related Benefits: (number of related benefits, if any. Below that, benefit hierarchy is shown from Base to Child to Grandchild, if any. Please see referenced Figma node for structure of this hierarchy).

- horizontal rule (border/light)

Below the horizontal rule, there is the navigation section. When clicking any of the below section titles, the page scrolls to that section with a 0.35 second animated scroll. There is a section indicator consisting of a blue vertical rule to the left of the section indicator. Each section has its own icon. Icons are located in the assets folder. 
Sections include:
- Basics
- Card Types & Values
- (sub-groups of Card Types & Values: Group 1, Group 2, etc.)
- Non-Effective Dated Changes
- Attachments
- Additional Language Support


## Start Date and Version
A new version is created when a benefit is duplicated. Generally this is for the same benefit with a new start and end date. 



## Basic Info (section title: Basics)

Each benefit page has a unique identification number (ID number or ID #). Each benefit falls into a category, is assigned to a region, specific countries, has an issuing bank, a supplier, a broker, a service provider, a name, a description, has a start and end date. 

### Basics info Fields:
- checkboxes for: Serviced by VCES, Issuer Sourced, Insurance Benefit

Content Fields:
- Benefit Internal Name
- Benefit Short Description
- Benefit Display Name
- Benefit Long Description
- Region
- Country / Countries
- Issuer / Bank
- Benefit Type
- Benefit Category
- Supplier
- Broker
- Service Provider

Other Value Information
- Start Date
- End Date
- Coverage Until Date
- Funded By
- Core / Optional

Add Additional Links
- Redemption Link Description
- Redemption Link URL


## Card Types & Budget

The benefit is assigned to at least one Visa card type, and may have tiers - such as spend hurdle tiers, where the cardholder must spend a certain amount to receive the first tier of benefit, another amount for the second tier, etc. This is configured in the Card Types & Budgets section of the benefit page. The benefit page must have one, and may have more than one Card Types & Budget section. This section has a grey background (background/light).

Content fields:
- Card Types

Total Budget
- Total Value of Benefit
- Currency

Cost (this section is contained within a border, 1 pixel, border/component, 8 pixel border radius). 
In edit mode (only), there is also a + New Cost button and an X to delete any existing costs.
Content:
- Cost type
- Cost Amount
- Currency
- Billed To
- Billing Options

Qualification (this section is contained within a border, 1 pixel, border/component, 8 pixel border radius)
In edit mode (only), there is also a button to add a new tier (+ new tier)
Content:
- Row showing Global, Hurdle (spend-based hurdles the cardholder must meet), and MCG (Merchant Category Group)
- Table showing Tiers, if any. Tier table has the following columns: Tier ID, Description, Country, Spend Amount From, Spend Amount To, Start Date, End Date. In edit mode (only), an X appears at the end of each row to delete that Tier row. 

Coverage appears for each Tier:
- Coverage Type
- Currency
- Redemption Based Cost (with an on-off switch appearing the the left in edit mode). If Redemption Based Cost is Switched to the ON position, the following row appears:
- Checkbox for Is Pooled
- Status Code
- User Type
- Restrictions per Visit
- User Quantity
- Entity to Bill
- Buttons for Remove, Add
(If Redemption Based Cost is switched to the OFF position, that row disappears)

In edit mode (only), below the Card Types & Budget section is a button, “+ Add New Card and Value”. Clicking this will add a new Card Types & Cost section with all fields blank, no tiers present. 



## Non-Effective Dated Changes

This section of the benefit has fields for information update to the benefit that can be changed without triggering a new version of the benefit. 


## Attachments & Languages

The benefit may have documents attached, and additional languages added. If an additional language other than English is specified, each attached document must be uploaded again, translated into the additional languages. 



## Footer
A footer appears at the bottom of the page with the Visa Logo, aligned left, a copyright line of text, and the Action button repeated. 

—


# PACKAGE MENU and PAGE STRUCTURE
To be determined. Currently out of scope. 


—

# File Structure — Strict Separation of Concerns

index.html — markup and structure only. No inline styles. No inline scripts. No data. This file is for the benefit menu and overlay.
benefit.html - markup and structure only. No inline styles, no inline scripts, no data. This file is for all benefit pages. 
styles.css — all visual styling, hover states, responsive breakpoints. There can be more than one .css file: one for the menu+overlay, one for the benefits page, one for shared/common styles. Name them appropriately. They do not have to be named style.css.
data.js — all data arrays and lookup tables. No logic. No DOM manipulation.
assets/ — logo files and icons
logic.js — all interactive behavior and DOM manipulation. This includes: menu row click handlers (open overlay), overlay close handlers (close on X click or outside click), 
navigation handlers (tab clicks, button clicks that change views), benefit state management (current benefit being viewed), 
pagination logic (which page of benefits is currently shown), session routing (which view is currently active: menu, overlay, benefit page, blank page). No data. No styling.

NOTE - IMPORTANT: The logic.js file may be split into three files: shared.js (sessionStorage store + hierarchy helpers + view-state routing used by both), menu.js (menu/overlay behavior), and benefit.js (benefit page behavior). The complexity of relationships across benefits and the menu likely requires this split. When this split is made (in Session 3), make sure that all 3 new files are kept updated with any changes, and the original logic.js file may be deleted or moved to an archive folder in case it needs to be referenced later for debugging, etc. 

Do not mix or misattribute these concerns to the wrong file. 

—


# STYLE RULES - for Universal for Menu, Overlays, Benefit Pages, Package Pages, Tooltips


## Typography

Use only Visa Dialect font for all text. Self-host from assets/fonts/ folder. 

Font files are in assets/fonts/ with this exact naming:
- VisaDialect-Light.woff2 / VisaDialect-Light.woff
- VisaDialect-Medium.woff2 / VisaDialect-Medium.woff  
- VisaDialect-Regular.woff2 / VisaDialect-Regular.woff
- VisaDialect-Semibold.woff2 / VisaDialect-Semibold.woff

Use this @font-face block in styles.css:

@font-face {
  font-family: 'Visa Dialect';
  src: url('assets/fonts/VisaDialect-Light.woff2') format('woff2'),
       url('assets/fonts/VisaDialect-Light.woff') format('woff');
  font-weight: 300;
}
@font-face {
  font-family: 'Visa Dialect';
  src: url('assets/fonts/VisaDialect-Medium.woff2') format('woff2'),
       url('assets/fonts/VisaDialect-Medium.woff') format('woff');
  font-weight: 500;
}
@font-face {
  font-family: 'Visa Dialect';
  src: url('assets/fonts/VisaDialect-Regular.woff2') format('woff2'),
       url('assets/fonts/VisaDialect-Regular.woff') format('woff');
  font-weight: 400;
}
@font-face {
  font-family: 'Visa Dialect';
  src: url('assets/fonts/VisaDialect-Semibold.woff2') format('woff2'),
       url('assets/fonts/VisaDialect-Semibold.woff') format('woff');
  font-weight: 600;
}

font-family stack: 'Visa Dialect', system-ui, -apple-system, sans-serif


## Colors

Use only these colors in the document. Do not use any other color. If you find a color in any Figma file that is not available on this list, change it to the closest color available in this list. Change any black text to text/inky. The one exception to this color palette is overlay backgrounds: When an overlay appears over a page view, the background for that overlay will obscure the page with a black screen at 25% opacity (#000000, 25%).  All other page elements must follow this color palette:

-visa/white: #FFFFFF 
-visa/blue: #112AA7 
-visa/navy: #15195A 
-visa/gold: #FCC015 

-text/inky: #060824 
-text/subtle: #696969 
-text/link: #112AA7 

-border/light: #E5EBF0 
-border/dark: #B9BACD 
-border/component: #808080 
-background/light: #F0F0F0 
-background/button-hover: #E5EBF0 

-color/red/background: #FFD6E9 
-color/red/icon: #BE2D2D 
-color/red/error-border: #9B0000 

-color/green/background: #D6F2C4 
-color/green/icon: #2F6F4E 

-color/grey/background: #E5E5E5 
-color/grey/icon: #696969 

-color/amber/background: #FFEF99 
-color/amber/icon: #875903 

-color/blue/background: #C7EDFF 
-color/blue/icon: #005E8A


## FORM FIELDS

Form fields have rounded corners of 6 pixels. They are 38 pixels tall. 


—


# SCOPE

The scope of this project may change or be updated. When that occurs, this CLAUDE.md document will be updated. 


## Current Scope

As of 06/30/2026, the scope for this project is to create the benefits menu configured for Bradesco Bank, create a unique benefit for each row on the menu, a unique overlay for each benefit, a benefit page for each benefit, a blank benefit page, and demonstrate the creation of a child benefit. Unique data will be created for each existing benefit. 


## Out of Scope

As of 06/30/2026, we will not create the packages menu, package pages, or package overlays. There may be references to packages that exist on benefit overlays, but these packages will not be created.



# SESSION PLAN

The code build will be divided into three sessions.


## Session 1

Build a benefit menu. Build an overlay. The overlay will appear when the user clicks on a menu row. 
In this session, DO NOT create unique benefits for each row. DO NOT create unique data for each overlay. 


## Session 2

Build one unique parent benefits page. When the user clicks on the “View benefit page” button in the menu overlay, navigate to this benefit page. When the user clicks “Cancel” on the benefit page, or when the user clicks on the “Benefits” tab in the top navigation bar, navigate the user back to the benefit menu. The parent benefit will be in published state.


## Session 3

Build a child benefit page. When the user clicks the “Create Extension” button on the parent benefit page, a child (ext lvl1) benefit page will be created from that parent page. The child benefit will be in unsaved draft state. When the user clicks “Cancel” on the child benefit page, or when the user clicks “Benefits” in the top navigation bar, navigate the user back to the benefit menu. 

## Session 4

Create a blank benefit page. When the user clicks the “New benefit” button in the benefits menu, navigate the user to a new, blank benefit page. None of the fields will be populated. The new benefit will be in unsaved draft state.


## Session 5

Create unique benefits for each row of the benefits menu. Each benefit will have a unique data set. Create three pages of unique benefits (30 unique benefit data sets total). 
The benefit menu pagination will display 9 total pages. For pages 1, 4, 7: Use the same set of 10 unique benefits. For pages 2, 5, 8: Use the same set of 10 unique benefits. For pages 3, 6, 9: Use the same set of 10 unique benefits. This gives the illusion to the viewer of 90 unique benefits. This is acceptable for the purposes of this prototype. 
In this session, DO NOT create benefit pages for each of the unique benefit data sets yet. DO NOT update the benefit overlay. Only update the menu. 


## Session 6

Create unique benefit overlay for each of the benefit data sets shown in the menu. The Basic Info and the Product tabs in the overlay will both need unique data for each benefit. 30 unique overlays total.
When the user clicks a row in the benefit menu, open an overlay showing data that corresponds with the benefit row the user clicked on.


## Session 7

Create a unique benefit page for each benefit data set. When the user clicks the “View benefit page” button in the menu overlay, navigate the user to that unique benefit page. If a user clicks on “Create extension” on that unique benefit page, navigate the user to an extension of that benefit, with all data copied except for the title of the page (add ext lvl1 or ext lvl2), the status of the benefit (unsaved draft), the unique ID, the number of related benefits, and update the benefit relationship hierarchy shown in the sidebar. 


## Session 8

Additional features may be added to this prototype. TBD.



—


# FURTHER CONTEXT FOR CREATING UNIQUE DATA SETS

## Visa card Types:
-Visa Classic
-Visa Gold
-Visa Platinum
-Visa Signature
-Visa Signature Preferred
-Visa Infinite
-Visa Business
-Visa Business Gold
-Visa Business Platinum


## Visa Benefit Categories:
-Travel & Transportation
-Hotels & Lodging
-Dining & Restaurants
-Shopping & Retail
-Groceries & Delivery
-Entertainment & Leisure
-Health & Wellness
-Financial Protection & Insurance
-Digital Services & Subscriptions
-Fuel & Automotive
-Rewards & Loyalty


## Countries Bradesco Bank operates in, and currency abbreviations for each: 
-Argentina — ARS (Argentine Peso)
-Brazil — BRL (Brazilian Real)
-Cayman Islands — KYD (Cayman Islands Dollar)
-Guatemala — GTQ (Guatemalan Quetzal)
-Mexico — MXN (Mexican Peso)

## Cost Types
-Activation Based
-Cost to Visa
-Price to Cardholder
-Price to Issuer
-Market Value
-On-going fixed cost
-Optional One time cost

## Coverage Types
Percentage
Spend-based
Count


—

# LOGIC

## View States
The prototype has four possible view states at any time:
- MENU: The benefits menu table with pagination
- OVERLAY: A benefit overlay on top of the menu
- BENEFIT PAGE: A single benefit's full page view
- BLANK PAGE: A new, empty benefit page

Only one view state is active at a time, except OVERLAY which appears on top of MENU, with a #000000 25% opacity background screen.

 Navigation rules:
- Menu row click → OVERLAY (menu remains visible beneath #000000 25% opacity screen)
- Overlay button “View benefit page" → BENEFIT PAGE
- Overlay close (X , close, or if user clicks outside overlay area) → MENU
- Benefit page button "Cancel" → MENU
- Benefit page navigation bar “Benefits" tab → MENU
- Benefit page button “Create Extension" → new BENEFIT PAGE (child)
- Menu "New Benefit" button → BLANK BENEFIT PAGE
- Blank page button “Cancel" → MENU
- Blank page navigation “bar Benefits" tab → MENU




# DO NOT

- Use any color not in the color palette above (except for the caveat for overlay backgrounds)
- Use any font other than Visa Dialect
- Put inline styles in index.html
- Put data in logic.js or styles.css
- Put DOM manipulation in data.js
- Invent benefit data not consistent with Bradesco Bank's 
  LatAm operations
- Create package pages, package menus, or package overlays 
  (Currently out of scope)
- Build sessions out of order

 