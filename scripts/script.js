/**
 * GENOVATE APPLICATION - COMPLETE JAVASCRIPT
 * Handles all interactive functionality including:
 * - Navigation
 * - Form handling and validation
 * - Popup management
 * - Image gallery
 * - Close button functionality
 */


document.addEventListener("DOMContentLoaded", function() {
    // ==================== GLOBAL VARIABLES ====================
    const currentYear = new Date().getFullYear();
    
    // ==================== NAVIGATION ====================
    // Mobile menu toggle functionality
    const initMobileMenu = () => {
        const hamburger = document.querySelector(".hamburger");
        const navLinks = document.querySelector(".nav-links");


        if (hamburger && navLinks) {
            hamburger.addEventListener("click", function() {
                navLinks.classList.toggle("active");
                this.classList.toggle("active");
            });


            document.querySelectorAll(".nav-links li a").forEach(link => {
                link.addEventListener("click", function() {
                    navLinks.classList.remove("active");
                    document.querySelector(".hamburger").classList.remove("active");
                });
            });
        }
    };


    // ==================== FORM MANAGEMENT ====================
    // Main application form flow
    const initMainApplicationFlow = () => {
        // Open main form from options
        const openMainForm = () => {
            const checkboxes = document.querySelectorAll('#optionsForm input[type="checkbox"]');
            const isChecked = Array.from(checkboxes).some(checkbox => checkbox.checked);
            
            if (!isChecked) {
                alert("Please select at least one option before continuing.");
                return;
            }


            document.getElementById('optionsForm').style.display = 'none';
            document.getElementById('mainApplicationForm').style.display = 'block';
            document.getElementById('fullName').focus();
        };


        // Submit main application form
        const handleMainApplicationSubmit = (e) => {
            e.preventDefault();
            
            const formData = {
                fullName: document.getElementById('fullName').value.trim(),
                mobileNumber: document.getElementById('mobileNumber').value.trim(),
                emailAddress: document.getElementById('emailAddress').value.trim(),
                college: document.getElementById('college_name').value.trim(),
                course: document.getElementById('courseSelect').value
            };


            const errorElement = document.getElementById('mainFormError');
            
            // Validate form
            if (!validateFormFields(formData, errorElement)) return;


            // If validation passes
            handleSuccessfulSubmission('genovateApplicationForm', 'Application submitted successfully!');
        };


        // Set up event listeners
        document.querySelector('.continue-btn')?.addEventListener('click', openMainForm);
        document.getElementById('genovateApplicationForm')?.addEventListener('submit', handleMainApplicationSubmit);
    };


    // ==================== POPUP MANAGEMENT ====================
    // Contact form popup
    const initContactPopup = () => {
        const showContactForm = () => {
            const popup = document.getElementById('contactPopupForm');
            popup.style.display = 'flex';
            setTimeout(() => {
                popup.classList.add('active');
                document.body.style.overflow = 'hidden';
                document.getElementById('contact-full-name').focus();
            }, 10);
        };


        const hideContactForm = () => {
            const popup = document.getElementById('contactPopupForm');
            popup.classList.remove('active');
            setTimeout(() => {
                popup.style.display = 'none';
                document.body.style.overflow = 'auto';
            }, 300);
        };


        const handleContactSubmit = (e) => {
            e.preventDefault();
            
            const formData = {
                fullName: document.getElementById('contact-full-name').value.trim(),
                email: document.getElementById('contact-email').value.trim(),
                phone: document.getElementById('contact-phone').value.trim(),
                message: document.getElementById('contact-message').value.trim()
            };


            // Validate form
            if (!validateFormFields(formData)) {
                alert("Please fill in all required fields correctly.");
                return;
            }


            handleSuccessfulSubmission('contactForm', "Thank you for your message! We'll contact you soon.");
            hideContactForm();
        };


        // Set up event listeners
        document.querySelector('.login-btn')?.addEventListener('click', showContactForm);
        document.getElementById('contactForm')?.addEventListener('submit', handleContactSubmit);
    };


    // Signup form popup
    const initSignupPopup = () => {
        const showSignupForm = () => {
            const popup = document.getElementById('signupPopupForm');
            popup.style.display = 'flex';
            setTimeout(() => {
                popup.classList.add('active');
                document.body.style.overflow = 'hidden';
                document.getElementById('signup-fullName').focus();
            }, 10);
        };


        const hideSignupForm = () => {
            const popup = document.getElementById('signupPopupForm');
            popup.classList.remove('active');
            setTimeout(() => {
                popup.style.display = 'none';
                document.body.style.overflow = 'auto';
            }, 300);
        };


        const handleSignupSubmit = (e) => {
            e.preventDefault();
            
            const formData = {
                fullName: document.getElementById('signup-fullName').value.trim(),
                email: document.getElementById('signup-emailAddress').value.trim(),
                phone: document.getElementById('signup-mobileNumber').value.trim(),
                college: document.getElementById('signup-college').value.trim(),
                course: document.getElementById('signup-courseSelect').value,
                goals: document.getElementById('signup-goals').value.trim()
            };


            const errorElement = document.getElementById('signupFormError');
            
            // Validate form
            if (!validateFormFields(formData, errorElement)) return;


            handleSuccessfulSubmission('signupForm', "Thank you for signing up! We'll be in touch soon.");
            hideSignupForm();
        };


        // Set up event listeners
        document.querySelector('.sign-up-btn')?.addEventListener('click', showSignupForm);
        document.getElementById('signupForm')?.addEventListener('submit', handleSignupSubmit);
    };


    // ==================== CLOSE BUTTON HANDLING ====================
    const initCloseButtons = () => {
        document.querySelectorAll('.close-btn').forEach(button => {
            button.addEventListener('click', function() {
                const popup = this.closest('.popup-form');
                if (popup) {
                    popup.classList.remove('active');
                    setTimeout(() => {
                        popup.style.display = 'none';
                        document.body.style.overflow = 'auto';
                    }, 300);
                }
            });
        });
    };


    // ==================== UTILITY FUNCTIONS ====================
    // Form validation helper
    const validateFormFields = (formData, errorElement = null) => {
        // Check required fields
        const missingFields = Object.entries(formData)
            .filter(([key, value]) => !value)
            .map(([key]) => key);


        if (missingFields.length > 0) {
            if (errorElement) {
                errorElement.textContent = "Please fill out all required fields.";
            }
            return false;
        }


        // Validate email format
        if (formData.email || formData.emailAddress) {
            const email = formData.email || formData.emailAddress;
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                if (errorElement) {
                    errorElement.textContent = "Please enter a valid email address.";
                }
                return false;
            }
        }


        // Validate phone number format
        if (formData.phone || formData.mobileNumber) {
            const phone = formData.phone || formData.mobileNumber;
            if (!/^\d{10}$/.test(phone)) {
                if (errorElement) {
                    errorElement.textContent = "Please enter a valid 10-digit phone number.";
                }
                return false;
            }
        }


        if (errorElement) {
            errorElement.textContent = "";
        }
        return true;
    };


    // Successful form submission handler
    const handleSuccessfulSubmission = (formId, successMessage) => {
        console.log(`${formId} submitted successfully`);
        alert(successMessage);
        document.getElementById(formId)?.reset();
    };


    // ==================== IMAGE GALLERY ====================
    
   // ==================== IMAGE GALLERY ====================
const initImageGallery = () => {
    const modal = document.getElementById("courseModal");
    const modalImage = document.getElementById("modalImage");
    const courseTitle = document.getElementById("courseTitle");
    const span = document.getElementsByClassName("close")[0];

    const images = {
        trending: [
            { image: "image/tranding/14.png", id: "course1" },
            { image: "image/cardnew/2.png", id: "course2" },
            { image: "image/cardnew/7.png", id: "course3" },
            { image: "image/tranding/10.png", id: "course4" },
            { image: "image/cardnew/8.png", id: "course5" },
            { image: "image/cardnew/5.png", id: "course6" },
            { image: "image/tranding/2.png", id: "course7" },
            { image: "image/cardnew/1.png", id: "course8" }
        ],
        data: [
            { image: "image/tranding/10.png", id: "data-course1" },
            { image: "image/cardnew/4.png", id: "data-course2" },
            { image: "image/tranding/12.png", id: "data-course3" },
            { image: "image/cardnew/8.png", id: "data-course4" }
        ],
        business: [
            { image: "image/cardnew/2.png", id: "business-course1" },
            { image: "image/cardnew/3.png", id: "business-course2" },
            { image: "image/tranding/16.png", id: "business-course3" },
            { image: "image/cardnew/8.png", id: "business-course4" },
            { image: "image/cardnew/7.png", id: "business-course5" },
            { image: "image/tranding/6.png", id: "business-course6" }
        ],
        design: [
            { image: "image/tranding/14.png", id: "design-course1" },
            { image: "image/tranding/2.png", id: "design-course2" },
            { image: "image/cardnew/5.png", id: "design-course3" },
            { image: "image/cardnew/7.png", id: "design-course4" },
            { image: "image/tranding/4.png", id: "design-course5" },
            { image: "image/tranding/6.png", id: "design-course6" }
        ],
        health: [
            { image: "image/tranding/14.png", id: "health-course1" },
            { image: "image/cardnew/6.png", id: "health-course2" }
        ],
        coming: [
            { image: "image/tranding/4.png", id: "coming-course1" },
            { image: "image/cardnew/1.png", id: "coming-course2" }
        ]
    };

    const categoryMap = {
        'trending': 'trending',
        'data technology': 'data',
        'business entrepreneurship': 'business',
        'design creative': 'design',
        'health wellness': 'health',
        'coming soon': 'coming'
    };

    const showCategory = (categoryKey) => {
        const gallery = document.getElementById("gallery");
        const buttons = document.querySelectorAll(".category-buttons button");

        buttons.forEach(button => {
            button.classList.remove("active");
            const buttonText = button.textContent.toLowerCase().replace(/&/g, '').replace(/\s+/g, ' ').trim();
            const buttonCategory = Object.keys(categoryMap).find(key => buttonText.includes(key));
            if (buttonCategory && categoryMap[buttonCategory] === categoryKey) {
                button.classList.add("active");
            }
        });

        gallery.innerHTML = "";

        if (images[categoryKey]) {
            images[categoryKey].forEach(course => {
                const courseElement = document.createElement("div");
                courseElement.className = "course-item";

                const img = document.createElement("img");
                img.src = course.image;
                img.alt = "Course Image";
                img.className = "clickable-image";
                img.onclick = () => {
                    modalImage.src = course.image;
                    modal.style.display = "block";
                };

                courseElement.appendChild(img);
                gallery.appendChild(courseElement);
            });
        }
    };

    // Make showCategory globally accessible (for HTML if needed)
    window.showCategory = showCategory;

    // Close modal logic
    if (span) {
        span.onclick = function () {
            modal.style.display = "none";
        };
    }

    window.onclick = function (event) {
        if (event.target == modal) {
            modal.style.display = "none";
        }
    };

    // Init only if gallery exists
    if (document.getElementById("gallery")) {
        showCategory('trending');

        document.querySelectorAll('.category-buttons button').forEach(button => {
            button.addEventListener('click', function () {
                const buttonText = this.textContent.toLowerCase().replace(/&/g, '').replace(/\s+/g, ' ').trim();
                const categoryKey = Object.keys(categoryMap).find(key => buttonText.includes(key));
                if (categoryKey) {
                    showCategory(categoryMap[categoryKey]);
                }
            });
        });

     

// Start once page loads
document.addEventListener('DOMContentLoaded', initImageGallery);



        // When the user clicks on <span> (x), close the modal
        span.onclick = function() {
            modal.style.display = "none";
        }


        // When the user clicks anywhere outside of the modal, close it
        window.onclick = function(event) {
            if (event.target == modal) {
                modal.style.display = "none";
            }
        }


        // Initialize gallery
        if (document.getElementById("gallery")) {
            // Show trending by default
            showCategory('trending');


            // Add click handlers to all category buttons
            document.querySelectorAll('.category-buttons button').forEach(button => {
                button.addEventListener('click', function() {
                    const buttonText = this.textContent.toLowerCase().replace(/&/g, '').replace(/\s+/g, ' ').trim();
                    const categoryKey = Object.keys(categoryMap).find(key => buttonText.includes(key));
                    if (categoryKey) {
                        showCategory(categoryMap[categoryKey]);
                    }
                });
            });


            // Add event listeners for modal buttons
            document.querySelector('.enroll-button').addEventListener('click', function() {
                alert('Enrollment process would start here!');
            });


            document.querySelector('.download-button').addEventListener('click', function() {
                alert('Brochure download would start here!');
            });
        }
    };


    // Initialize when DOM is loaded
    document.addEventListener('DOMContentLoaded', initImageGallery);


    // ==================== FOOTER ====================
    document.getElementById("year").textContent = new Date().getFullYear();
    // ==================== INITIALIZATION ====================
    const initializeApp = () => {
        initMobileMenu();
        initMainApplicationFlow();
        initContactPopup();
        initSignupPopup();
        initCloseButtons();
        initImageGallery();
        updateFooterYear();
        
        // Initialize single checkbox selection in options form
        document.querySelectorAll('#optionsForm .checkbox-group input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', function() {
                if (this.checked) {
                    document.querySelectorAll('#optionsForm .checkbox-group input[type="checkbox"]').forEach(cb => {
                        if (cb !== this) cb.checked = false;
                    });
                }
            });
        });
    };


    // Start the application
    initializeApp();
});


// Image slider initialization (if needed)
function initImageSlider() {
    const sliderTrack = document.querySelector(".slider-track");
    if (!sliderTrack) return;


    const slides = Array.from(document.querySelectorAll(".slide"));
    slides.forEach(slide => {
        sliderTrack.appendChild(slide.cloneNode(true));
    });


    // Add animation logic here




    
}


$(document).ready(function(){
    $('.review-slider').slick({
        slidesToShow: 3,
        slidesToScroll: 1,
        arrows: true,
        prevArrow: $('.prev'),
        nextArrow: $('.next'),
        autoplay: true,
        autoplaySpeed: 2000,
        responsive: [
            {
                breakpoint: 1024,
                settings: {
                    slidesToShow: 2,
                    slidesToScroll: 1
                }
            },
            {
                breakpoint: 600,
                settings: {
                    slidesToShow: 1,
                    slidesToScroll: 1
                }
            }
        ]
    });
});






document.addEventListener('DOMContentLoaded', function() {
    // Handle all anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth'
                });
            }
        });
    });
});