// Slideshow functionality
let slideIndex = 1;
let slideTimer;

function showSlides(n) {
    let slides = document.getElementsByClassName("slide");
    let dots = document.getElementsByClassName("dot");
    
    if (n > slides.length) { slideIndex = 1 }
    if (n < 1) { slideIndex = slides.length }
    
    for (let i = 0; i < slides.length; i++) {
        slides[i].classList.remove("active");
    }
    
    for (let i = 0; i < dots.length; i++) {
        dots[i].classList.remove("active");
    }
    
    if (slides[slideIndex - 1] && dots[slideIndex - 1]) {
        slides[slideIndex - 1].classList.add("active");
        dots[slideIndex - 1].classList.add("active");
    }
}

function currentSlide(n) {
    clearInterval(slideTimer);
    slideIndex = n;
    showSlides(slideIndex);
    startAutoSlide();
    
    // Track manual slide interaction
    trackSlideshowInteraction('manual_click', slideIndex);
}

function nextSlide() {
    slideIndex++;
    showSlides(slideIndex);
    
    // Track auto-advance
    trackSlideshowInteraction('auto_advance', slideIndex);
}

function startAutoSlide() {
    slideTimer = setInterval(nextSlide, 4000); // Change slide every 4 seconds
}

// Initialize slideshow when page loads
document.addEventListener('DOMContentLoaded', function() {
    showSlides(slideIndex);
    startAutoSlide();
    
    // Pause auto-slide on hover
    const slideshow = document.querySelector('.slideshow-container');
    if (slideshow) {
        slideshow.addEventListener('mouseenter', () => {
            clearInterval(slideTimer);
        });
        
        slideshow.addEventListener('mouseleave', () => {
            startAutoSlide();
        });
    }
});

// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Header background on scroll
window.addEventListener('scroll', function() {
    const header = document.querySelector('.header');
    if (window.scrollY > 100) {
        header.style.background = 'rgba(15, 15, 15, 0.98)';
    } else {
        header.style.background = 'rgba(15, 15, 15, 0.95)';
    }
});

// Add animation on scroll for feature cards
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver(function(entries) {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Observe feature cards for animation
document.addEventListener('DOMContentLoaded', function() {
    const featureCards = document.querySelectorAll('.feature-card, .screenshot-item');
    featureCards.forEach(card => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(30px)';
        card.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(card);
    });
});

// Mobile menu toggle (if needed in future)
function toggleMobileMenu() {
    const navLinks = document.querySelector('.nav-links');
    navLinks.classList.toggle('mobile-open');
}

// Add click tracking for download buttons
document.querySelectorAll('.download-btn').forEach(button => {
    button.addEventListener('click', function() {
        const platform = this.classList.contains('ios') ? 'iOS' : 'Android';
        const location = this.closest('.hero') ? 'hero_section' : 
                        this.closest('.download-section') ? 'download_section' : 'unknown';
        
        console.log(`Download clicked: ${platform} from ${location}`);
        
        // Track download events
        if (typeof gtag !== 'undefined') {
            gtag('event', 'download_click', {
                'event_category': 'App Downloads',
                'event_label': platform,
                'custom_parameter_location': location
            });
        }
        
        // Track to Firebase Analytics if available
        if (typeof firebase !== 'undefined' && firebase.analytics) {
            firebase.analytics().logEvent('app_download_attempt', {
                platform: platform,
                location: location,
                timestamp: new Date().toISOString()
            });
        }
        
        // Send to Firebase Realtime Database for your tracking
        fetch('https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app/downloads.json', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                platform: platform,
                location: location,
                timestamp: new Date().toISOString(),
                userAgent: navigator.userAgent,
                referrer: document.referrer || 'direct'
            })
        }).catch(err => console.log('Firebase tracking error:', err));
    });
});

// Lazy loading for images (performance optimization)
if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.src = img.dataset.src || img.src;
                img.classList.remove('lazy');
                imageObserver.unobserve(img);
            }
        });
    });

    document.querySelectorAll('img[data-src]').forEach(img => {
        imageObserver.observe(img);
    });
}

// Contact form handling
function handleContactForm(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const name = formData.get('name');
    const email = formData.get('email');
    const subject = formData.get('subject');
    const message = formData.get('message');
    
    // Validate required fields
    if (!name || !email || !message) {
        showFormMessage('Please fill in all required fields.', 'error');
        return;
    }
    
    // Create mailto link
    const mailtoSubject = subject ? `OfficeTrack Support: ${subject}` : 'OfficeTrack Support';
    const mailtoBody = `Name: ${name}%0D%0AEmail: ${email}%0D%0A%0D%0AMessage:%0D%0A${message}`;
    const mailtoLink = `mailto:support@officetrack.app?subject=${encodeURIComponent(mailtoSubject)}&body=${mailtoBody}`;
    
    // Open email client
    window.location.href = mailtoLink;
    
    // Show success message
    showFormMessage('Thank you for your message! Your email client will open to send the message.', 'success');
}

// Show form message
function showFormMessage(message, type = 'success') {
    // Remove existing message
    const existingMessage = document.querySelector('.form-message');
    if (existingMessage) {
        existingMessage.remove();
    }
    
    // Create new message element
    const messageEl = document.createElement('div');
    messageEl.className = `form-message ${type}`;
    messageEl.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-triangle'}"></i>
        ${message}
    `;
    
    // Add CSS for form message
    messageEl.style.cssText = `
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 1rem;
        margin: 1rem 0;
        border-radius: 8px;
        font-weight: 500;
        background: ${type === 'success' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)'};
        color: ${type === 'success' ? '#22c55e' : '#ef4444'};
        border: 1px solid ${type === 'success' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'};
        animation: slideIn 0.3s ease;
    `;
    
    // Insert message after form
    const form = document.querySelector('.contact-form');
    if (form) {
        form.parentNode.insertBefore(messageEl, form.nextSibling);
        
        // Auto-remove message after 5 seconds
        setTimeout(() => {
            messageEl.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => messageEl.remove(), 300);
        }, 5000);
    }
}

// Field validation
function validateField(field) {
    const value = field.value.trim();
    let isValid = true;
    let errorMessage = '';
    
    // Remove existing error message
    const existingError = field.parentNode.querySelector('.error-message');
    if (existingError) {
        existingError.remove();
    }
    
    // Validation rules
    if (field.hasAttribute('required') && !value) {
        isValid = false;
        errorMessage = 'This field is required';
    } else if (field.type === 'email' && value) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
            isValid = false;
            errorMessage = 'Please enter a valid email address';
        }
    }
    
    // Show error if invalid
    if (!isValid) {
        field.style.borderColor = '#ef4444';
        
        const errorEl = document.createElement('div');
        errorEl.className = 'error-message';
        errorEl.textContent = errorMessage;
        errorEl.style.cssText = `
            color: #ef4444;
            font-size: 0.875rem;
            margin-top: 0.25rem;
            animation: slideIn 0.3s ease;
        `;
        
        field.parentNode.appendChild(errorEl);
    } else if (value) {
        field.style.borderColor = '#22c55e';
    } else {
        field.style.borderColor = '';
    }
    
    return isValid;
}

// Back to top functionality
function addBackToTop() {
    // Create back to top button
    const backToTop = document.createElement('button');
    backToTop.innerHTML = '<i class="fas fa-arrow-up"></i>';
    backToTop.className = 'back-to-top';
    backToTop.setAttribute('aria-label', 'Back to top');
    backToTop.style.cssText = `
        position: fixed;
        bottom: 2rem;
        right: 2rem;
        width: 50px;
        height: 50px;
        background: linear-gradient(135deg, #f59e0b, #fbbf24);
        color: #1a1a1a;
        border: none;
        border-radius: 50%;
        cursor: pointer;
        display: none;
        align-items: center;
        justify-content: center;
        font-size: 1.25rem;
        font-weight: 600;
        transition: all 0.3s ease;
        z-index: 1000;
        box-shadow: 0 4px 15px rgba(245, 158, 11, 0.3);
    `;
    
    document.body.appendChild(backToTop);
    
    // Show/hide button based on scroll
    window.addEventListener('scroll', () => {
        if (window.pageYOffset > 300) {
            backToTop.style.display = 'flex';
        } else {
            backToTop.style.display = 'none';
        }
    });
    
    // Scroll to top on click
    backToTop.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
    
    // Hover effects
    backToTop.addEventListener('mouseenter', () => {
        backToTop.style.transform = 'translateY(-3px) scale(1.1)';
        backToTop.style.boxShadow = '0 8px 25px rgba(245, 158, 11, 0.4)';
    });
    
    backToTop.addEventListener('mouseleave', () => {
        backToTop.style.transform = 'translateY(0) scale(1)';
        backToTop.style.boxShadow = '0 4px 15px rgba(245, 158, 11, 0.3)';
    });
}

// Enhanced page initialization
document.addEventListener('DOMContentLoaded', function() {
    // Track page views
    trackPageView();
    
    // Track user engagement
    trackUserEngagement();
    
    // Initialize back to top for all pages
    addBackToTop();
    
    // Initialize contact form if on contact page
    const contactForm = document.querySelector('.contact-form');
    if (contactForm) {
        contactForm.addEventListener('submit', handleContactForm);
        
        // Add form validation
        const inputs = contactForm.querySelectorAll('input, textarea');
        inputs.forEach(input => {
            input.addEventListener('blur', function() {
                validateField(this);
            });
            
            input.addEventListener('input', function() {
                // Clear validation on input
                this.style.borderColor = '';
                const errorMsg = this.parentNode.querySelector('.error-message');
                if (errorMsg) {
                    errorMsg.remove();
                }
            });
        });
    }
    
    // Add CSS animations for form messages
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from {
                opacity: 0;
                transform: translateY(-10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        @keyframes slideOut {
            from {
                opacity: 1;
                transform: translateY(0);
            }
            to {
                opacity: 0;
                transform: translateY(-10px);
            }
        }
        
        .form-message {
            animation: slideIn 0.3s ease;
        }
    `;
    document.head.appendChild(style);
});

// Copy functionality for contact methods
function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => {
            showCopySuccess();
        });
    } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'absolute';
        textArea.style.left = '-999999px';
        document.body.prepend(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            showCopySuccess();
        } catch (error) {
            console.error('Copy failed:', error);
        } finally {
            textArea.remove();
        }
    }
}

function showCopySuccess() {
    // Create temporary success message
    const successEl = document.createElement('div');
    successEl.textContent = 'Copied to clipboard!';
    successEl.style.cssText = `
        position: fixed;
        bottom: 5rem;
        right: 2rem;
        background: #22c55e;
        color: white;
        padding: 0.75rem 1rem;
        border-radius: 8px;
        font-size: 0.875rem;
        font-weight: 500;
        z-index: 1001;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(successEl);
    
    setTimeout(() => {
        successEl.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => successEl.remove(), 300);
    }, 2000);
}

// Analytics tracking functions
function trackPageView() {
    const pageData = {
        page: window.location.pathname,
        title: document.title,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        referrer: document.referrer || 'direct',
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        language: navigator.language
    };
    
    // Send to Firebase for your tracking
    fetch('https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app/page_views.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pageData)
    }).catch(err => console.log('Page view tracking error:', err));
    
    // Track with Google Analytics if available
    if (typeof gtag !== 'undefined') {
        gtag('event', 'page_view', {
            'event_category': 'Engagement',
            'page_title': document.title,
            'page_location': window.location.href
        });
    }
}

function trackUserEngagement() {
    let startTime = Date.now();
    let scrollDepth = 0;
    let maxScrollDepth = 0;
    
    // Track scroll depth
    window.addEventListener('scroll', function() {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        scrollDepth = Math.round((scrollTop / docHeight) * 100);
        maxScrollDepth = Math.max(maxScrollDepth, scrollDepth);
    });
    
    // Track time on page and engagement when user leaves
    function trackEngagement() {
        const timeOnPage = Math.round((Date.now() - startTime) / 1000); // seconds
        
        if (timeOnPage > 5) { // Only track if user spent more than 5 seconds
            const engagementData = {
                timeOnPage: timeOnPage,
                maxScrollDepth: maxScrollDepth,
                page: window.location.pathname,
                timestamp: new Date().toISOString(),
                engaged: timeOnPage > 30 || maxScrollDepth > 50
            };
            
            // Send to Firebase
            fetch('https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app/user_engagement.json', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(engagementData)
            }).catch(err => console.log('Engagement tracking error:', err));
            
            // Track with Google Analytics
            if (typeof gtag !== 'undefined') {
                gtag('event', 'user_engagement', {
                    'event_category': 'Engagement',
                    'custom_parameter_time_on_page': timeOnPage,
                    'custom_parameter_scroll_depth': maxScrollDepth
                });
            }
        }
    }
    
    // Track on page unload
    window.addEventListener('beforeunload', trackEngagement);
    
    // Track on visibility change (mobile/tab switching)
    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'hidden') {
            trackEngagement();
        }
    });
}

// Track slideshow interactions
function trackSlideshowInteraction(action, slideIndex) {
    const interactionData = {
        action: action, // 'auto_advance', 'manual_click', 'hover_pause'
        slideIndex: slideIndex,
        timestamp: new Date().toISOString(),
        page: window.location.pathname
    };
    
    fetch('https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app/slideshow_interactions.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(interactionData)
    }).catch(err => console.log('Slideshow tracking error:', err));
    
    if (typeof gtag !== 'undefined') {
        gtag('event', 'slideshow_interaction', {
            'event_category': 'User Interaction',
            'event_label': action,
            'custom_parameter_slide': slideIndex
        });
    }
}