# OfficeTrack Web Dashboard

A professional marketing website for the OfficeTrack mobile app featuring app screenshots, download links, and legal pages.

## 🌟 Features

- **Modern Design**: Black and orange theme matching the app design
- **Responsive Layout**: Mobile-first responsive design
- **App Screenshots Slideshow**: Interactive carousel with 9 app screenshots
- **Download Integration**: Direct links to App Store and Google Play
- **Legal Pages**: Complete privacy policy, terms of service, and contact forms
- **Performance Optimized**: Lazy loading, smooth animations, and fast loading
- **SEO Ready**: Proper meta tags and semantic HTML structure

## 📁 File Structure

```
web-dashboard/
├── index.html          # Main landing page
├── styles.css          # All styles and responsive design
├── script.js           # JavaScript functionality
├── privacy.html        # Privacy policy page
├── terms.html          # Terms of service page
├── contact.html        # Contact page with forms and FAQ
├── assets/
│   └── screenshots/    # App screenshots (to be added)
└── README.md          # This file
```

## 🖼️ Screenshots Setup

1. Add your app screenshots to the `assets/screenshots/` directory:
   - screenshot1.png
   - screenshot2.png
   - screenshot3.png
   - screenshot4.png
   - screenshot5.png
   - screenshot6.png
   - screenshot7.png
   - screenshot8.png
   - screenshot9.png

2. The slideshow will automatically cycle through these images

## 🚀 Deployment Options

### Option 1: Firebase Hosting (Recommended)

1. Install Firebase CLI:
   ```bash
   npm install -g firebase-tools
   ```

2. Initialize Firebase in the web-dashboard directory:
   ```bash
   cd web-dashboard
   firebase init hosting
   ```

3. Configure firebase.json:
   ```json
   {
     "hosting": {
       "public": ".",
       "ignore": [
         "firebase.json",
         "**/.*",
         "**/node_modules/**"
       ],
       "rewrites": [
         {
           "source": "**",
           "destination": "/index.html"
         }
       ],
       "headers": [
         {
           "source": "**/*.@(js|css)",
           "headers": [
             {
               "key": "Cache-Control",
               "value": "max-age=31536000"
             }
           ]
         }
       ]
     }
   }
   ```

4. Deploy:
   ```bash
   firebase deploy
   ```

### Option 2: Netlify

1. Create a Netlify account at https://netlify.com
2. Drag and drop the `web-dashboard` folder to Netlify's deploy area
3. Configure custom domain if needed

### Option 3: GitHub Pages

1. Create a new repository on GitHub
2. Upload all files from `web-dashboard` directory
3. Enable GitHub Pages in repository settings
4. Choose source as main branch

### Option 4: Traditional Web Hosting

1. Upload all files to your web hosting provider
2. Ensure the files are in the public_html or www directory
3. Configure any necessary .htaccess rules for clean URLs

## 🔧 Customization

### Colors and Branding

The CSS uses custom properties for easy theming:

```css
:root {
    --primary-orange: #f59e0b;
    --primary-yellow: #fbbf24;
    --dark-bg: #0f0f0f;
    --darker-bg: #1a1a1a;
    --text-primary: #ffffff;
    --text-secondary: #a1a1aa;
    --card-bg: #262626;
}
```

### App Store Links

Update the download buttons in `index.html`:

```html
<a href="YOUR_IOS_APP_STORE_LINK" class="download-btn ios">
<a href="YOUR_GOOGLE_PLAY_STORE_LINK" class="download-btn android">
```

### Contact Information

Update contact details in `contact.html`:

- Email addresses
- Support information
- FAQ content
- Company details

### Analytics (Optional)

Add Google Analytics or other tracking by including the tracking code in the `<head>` section of each HTML file.

## 📱 Mobile Responsiveness

The website is fully responsive with breakpoints at:
- Desktop: 1024px+
- Tablet: 768px-1023px
- Mobile: 320px-767px

## 🔍 SEO Optimization

- Semantic HTML structure
- Meta tags for social media sharing
- Proper heading hierarchy
- Alt texts for images
- Fast loading performance

## 📧 Contact Form

The contact form uses mailto links to open the user's email client. For a more advanced setup, you can integrate with:

- Formspree
- Netlify Forms
- EmailJS
- Custom backend API

## 🎨 Design Features

- Smooth scroll animations
- Interactive slideshow with auto-play
- Hover effects on cards and buttons
- Loading animations
- Back-to-top button
- Form validation
- Success/error messages

## 📄 Legal Pages

Complete legal framework included:

- **Privacy Policy**: Emphasizes local data storage and user privacy
- **Terms of Service**: Comprehensive terms with employment disclaimers
- **Contact Page**: Multiple contact methods and FAQ section

## 🛠️ Development

For local development:

1. Open `index.html` in a web browser
2. Use a local server for best results:
   ```bash
   python -m http.server 8000
   # or
   npx serve
   ```

## 📝 License

This web dashboard is part of the OfficeTrack app project. All rights reserved.

## 📞 Support

For questions about this web dashboard, contact: support@officetrack.app