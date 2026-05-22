/**
 * GENOVATE APPLICATION - COMPLETE JAVASCRIPT (Enhanced Version)
 * Handles all interactive functionality including:
 * - Navigation & Smooth Scroll
 * - Form handling and validation
 * - Popup management
 * - Accessibility
 */


document.addEventListener("DOMContentLoaded", function () {
    // ==================== GLOBAL VARIABLES ====================
    const currentYear = new Date().getFullYear();


    // ==================== SMOOTH SCROLLING & DOT NAVIGATION ====================
    document.querySelectorAll('.dot').forEach(dot => {
        // Add accessibility
        dot.setAttribute('tabindex', '0');
        dot.setAttribute('aria-label', `Go to Page ${dot.getAttribute('data-page')}`);


        // Click event
        dot.addEventListener('click', () => {
            const pageId = dot.getAttribute('data-page');
            const page = document.getElementById(`page${pageId}`);
            if (page) {
                page.scrollIntoView({ behavior: 'smooth' });
            }


            document.querySelectorAll('.dot').forEach(d => d.classList.remove('active'));
            dot.classList.add('active');
        });


        // Keyboard accessibility
        dot.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                dot.click();
            }
        });
    });


    // Scroll listener (debounced)
    let scrollTimeout;
    window.addEventListener('scroll', () => {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            const pages = document.querySelectorAll('.page');
            let currentPage = 1;


            pages.forEach((page, index) => {
                const rect = page.getBoundingClientRect();
                if (rect.top <= window.innerHeight / 2) {
                    currentPage = index + 1;
                }
            });


            document.querySelectorAll('.dot').forEach(dot => {
                dot.classList.remove('active');
                if (parseInt(dot.getAttribute('data-page')) === currentPage) {
                    dot.classList.add('active');
                }
            });
        }, 100);
    });


    // ==================== MOBILE MENU ====================
    const initMobileMenu = () => {
        const hamburger = document.querySelector(".hamburger");
        const navLinks = document.querySelector(".nav-links");


        if (hamburger && navLinks) {
            hamburger.addEventListener("click", function () {
                navLinks.classList.toggle("active");
                this.classList.toggle("active");
            });


            document.querySelectorAll(".nav-links li a").forEach(link => {
                link.addEventListener("click", function () {
                    navLinks.classList.remove("active");
                    hamburger.classList.remove("active");
                });
            });
        }
    };


    // ==================== FORM MANAGEMENT ====================
    const initMainApplicationFlow = () => {
        const openMainForm = () => {
            const checkboxes = document.querySelectorAll('#optionsForm input[type="checkbox"]');
            const isChecked = Array.from(checkboxes).some(cb => cb.checked);


            if (!isChecked) {
                alert("Please select at least one option before continuing.");
                return;
            }


            document.getElementById('optionsForm').style.display = 'none';
            document.getElementById('mainApplicationForm').style.display = 'block';
            document.getElementById('fullName')?.focus();
        };


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
            if (!validateFormFields(formData, errorElement)) return;


            handleSuccessfulSubmission('genovateApplicationForm', 'Application submitted successfully!');
        };


        document.querySelector('.continue-btn')?.addEventListener('click', openMainForm);
        document.getElementById('genovateApplicationForm')?.addEventListener('submit', handleMainApplicationSubmit);
    };


    // ==================== POPUP UTILS ====================
    const showPopup = (popupId, focusId) => {
        const popup = document.getElementById(popupId);
        if (popup) {
            popup.style.display = 'flex';
            setTimeout(() => {
                popup.classList.add('active');
                document.body.style.overflow = 'hidden';
                if (focusId) document.getElementById(focusId)?.focus();
            }, 10);
        }
    };


    const hidePopup = (popupId) => {
        const popup = document.getElementById(popupId);
        if (popup) {
            popup.classList.remove('active');
            setTimeout(() => {
                popup.style.display = 'none';
                document.body.style.overflow = 'auto';
            }, 300);
        }
    };


    const initContactPopup = () => {
        document.querySelector('.login-btn')?.addEventListener('click', () => showPopup('contactPopupForm', 'contact-full-name'));


        document.getElementById('contactForm')?.addEventListener('submit', (e) => {
            e.preventDefault();


            const formData = {
                fullName: document.getElementById('contact-full-name').value.trim(),
                email: document.getElementById('contact-email').value.trim(),
                phone: document.getElementById('contact-phone').value.trim(),
                message: document.getElementById('contact-message').value.trim()
            };


            if (!validateFormFields(formData)) {
                alert("Please fill in all required fields correctly.");
                return;
            }


            handleSuccessfulSubmission('contactForm', "Thank you for your message! We'll contact you soon.");
            hidePopup('contactPopupForm');
        });
    };


    const initSignupPopup = () => {
        document.querySelector('.sign-up-btn')?.addEventListener('click', () => showPopup('signupPopupForm', 'signup-fullName'));


        document.getElementById('signupForm')?.addEventListener('submit', (e) => {
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
            if (!validateFormFields(formData, errorElement)) return;


            handleSuccessfulSubmission('signupForm', "Thank you for signing up! We'll be in touch soon.");
            hidePopup('signupPopupForm');
        });
    };


    // ==================== CLOSE BUTTONS ====================
    const initCloseButtons = () => {
        document.querySelectorAll('.close-btn').forEach(button => {
            button.addEventListener('click', function () {
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


    // ==================== JOIN FORM HANDLING ====================
    const initJoinForm = () => {
        const joinButton = document.querySelector('.join-form button');
        if (joinButton) {
            joinButton.addEventListener('click', (e) => {
                e.preventDefault();
                const form = document.querySelector('.join-form');
                const formData = {
                    fullName: form.querySelector('input[name="fullName"]')?.value.trim(),
                    email: form.querySelector('input[name="email"]')?.value.trim(),
                    phone: form.querySelector('input[name="phone"]')?.value.trim()
                };


                if (!validateFormFields(formData)) {
                    alert("Please fill in all required fields correctly.");
                    return;
                }


                handleSuccessfulSubmission('join-form', 'Thank you for your interest! We will contact you soon.');
            });
        }
    };


// ==================== VALIDATION & SUCCESS ====================
    const validateFormFields = (formData, errorElement = null) => {
        const missingFields = Object.entries(formData).filter(([_, value]) => !value).map(([key]) => key);
        if (missingFields.length > 0) {
            if (errorElement) errorElement.textContent = "Please fill out all required fields.";
            return false;
        }


        const email = formData.email || formData.emailAddress;
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            if (errorElement) errorElement.textContent = "Please enter a valid email address.";
            return false;
        }


        const phone = formData.phone || formData.mobileNumber;
        if (phone && !/^\d{10}$/.test(phone)) {
            if (errorElement) errorElement.textContent = "Please enter a valid 10-digit phone number.";
            return false;
        }


        if (errorElement) errorElement.textContent = "";
        return true;
    };


    const handleSuccessfulSubmission = (formId, successMessage) => {
        console.log(`${formId} submitted successfully`);
        alert(successMessage);
        document.getElementById(formId)?.reset();
    };


    // ==================== INITIALIZE ALL ====================
    initMobileMenu();
    initMainApplicationFlow();
    initContactPopup();
    initSignupPopup();
    initCloseButtons();
    initJoinForm();
});