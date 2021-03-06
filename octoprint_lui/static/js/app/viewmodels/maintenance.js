$(function () {
    function MaintenanceViewModel(parameters) {
        var self = this;

        self.flyout = parameters[0];
        self.printerState = parameters[1];
        self.settings = parameters[2];
        self.toolInfo = parameters[3];
        self.filament = parameters[4];
        self.navigation = parameters[5];
        self.introView = parameters[6];

        self.poweringUpInfo = null;
        self.movingToHeadSwapPositionInfo = null;

        self.isHeadMaintenanceFlyoutOpen = false;
        self.isSavingMaterial = ko.observable(false);

        self.showHeadMaintenance = function () {

            var text = gettext("You are about to move the printer to the head maintenance position.");
            var question = gettext("Do you want to continue?");
            var title = gettext("Maintenance position");
            var dialog = {'title': title, 'text': text, 'question' : question};

            self.flyout.showConfirmationFlyout(dialog, true)
                .done(function () {
                    self.filament.requestData().always(function () {
                        self.isHeadMaintenanceFlyoutOpen = true;
                        self.moveToHeadMaintenancePosition();
                        self.flyout.showFlyout('head_maintenance', true).always(self.afterHeadMaintenance);
                    });
                });
        };

        self.headSwapPosition = function () {
            var text = gettext("You are about to move the printer to the hot end swap position. This will leave the printer on, but disconnects it from the software.");
            var question = gettext("Do you want to continue?");
            var title = gettext("Hot end swap position");
            var dialog = { 'title': title, 'text': text, 'question': question };

            self.flyout.showConfirmationFlyout(dialog, true)
                .done(function () {
                    self.moveToHeadSwapPosition();
                });
        };

        self.cleanBedPosition = function ()  {

            var text = gettext("You are about to move the printer to the clean bed position. This move will home all axis! Make sure there is no print on the bed.");
            var question = gettext("Do want to continue?");
            var title = gettext("Clean bed position");
            var dialog = {'title': title, 'text': text, 'question' : question};

            self.flyout.showConfirmationFlyout(dialog, true)
                .done(function(){
                    self.moveToCleanBedPosition();

                    self.flyout.showInfo(gettext('Maintenance position'),
                        gettext('Press OK when you are done with cleaning the bed. This will home the printer.'), false, self.afterCleanBed);
                });
        };

        self.afterHeadMaintenance = function () {
            sendToApi("maintenance/head/finish");
            self.isHeadMaintenanceFlyoutOpen = false;

            // Restore any filaments that couldn't be loaded (eg when there was a HT hot end required)
            self.filament.requestData();
        };

        self.afterHeadSwap = function () {
            sendToApi("maintenance/head/swap/finish");
        };

        self.afterCleanBed = function ()
        {
            sendToApi("maintenance/bed/clean/finish");
        };

        self.calibrateExtruders = function ()  {
            self.flyout.showFlyout('extrudercalibration', true);
            //IntroJS
            if(self.introView.isTutorialStarted){
                // Wait for the transition to complete, then wait for a little bit more and then, finally, move the helper layer
                $('#extrudercalibration_flyout').one("transitionend", function () {
                    self.introView.introInstance.goToStep(self.introView.getStepNumberByName("startLargeCalibration"));
                    self.introView.introInstance.refresh();
                });
            }
        }

        self.calibrateBed = function()
        {
            self.flyout.showFlyout('bedcalibration', true);
            //IntroJS
            if(self.introView.isTutorialStarted){
                // Wait for the transition to complete, then wait for a little bit more and then, finally, move the helper layer
                $('#bedcalibration_flyout').one("transitionend", function () {
                    self.introView.introInstance.goToStep(self.introView.getStepNumberByName("continueBedCalibration"));
                    self.introView.introInstance.refresh();
                });
            }
        };

        self.moveToCleanBedPosition = function () {
            sendToApi("maintenance/bed/clean/start").done(function ()  {
                $.notify({ title: gettext("Clean bed"), text: gettext("The printer is moving towards the clean bed position.") }, "success");
            });
        };

        self.moveToHeadMaintenancePosition = function()
        {
            sendToApi("maintenance/head/start").done(function () {
                $.notify({ title: gettext("Head maintenance"), text: gettext("The printhead is moving towards the maintenance position.") }, "success");
            });
        }
        self.moveToWipingSequence = function()
        {
            sendToApi("maintenance/head/wipe").done(function () {
                $.notify({ title: gettext("Head wiping"), text: gettext("The printhead is moving to wipe the nozzles.") }, "success");
            });
        }

        self.moveToHeadSwapPosition = function (skipHeatCheck) {
            var tools = self.toolInfo.tools();

            if (!skipHeatCheck &&
                (tools[0]["actual"]() >= EXTRUDER_HOT_THRESHOLD || tools[1]["actual"]() >= EXTRUDER_HOT_THRESHOLD))
            {
                var text = gettext("One of the print heads has not cooled down yet. Print head maintenance may cause serious injury. It is adviced to wait for the print heads to cool down.");
                var question = gettext("Are you sure you want to continue?");
                var title = gettext("Clean bed position")
                var dialog = { 'title': title, 'text': text, 'question': question };

                self.flyout.showConfirmationFlyout(dialog, true)
                .done(function () {
                    self.moveToHeadSwapPosition(true); // Retry, but skip heat check
                });

                return;
            }

            // From here only executed if temperatures are < 50, or heat check is ignored
            sendToApi("maintenance/head/swap/start");

            self.movingToHeadSwapPositionInfo = self.flyout.showInfo(gettext("Maintenance position"), gettext("The printhead is moving towards the maintenance position."), true);
        };

        self.finishHeadSwap = function ()
        {
            if (self.movingToHeadSwapPositionInfo !== undefined) {
                self.flyout.closeInfo(self.movingToHeadSwapPositionInfo);
                self.flyout.showInfo(gettext('Maintenance position'), gettext('Press OK when you are done with the print head maintenance. This will home the printer.'), false, self.afterHeadSwap);
                self.movingToHeadSwapPositionInfo = undefined;
            }

        };

        self.logFiles = function ()
        {
            self.navigation.showSettingsTopic('logs');
        };

        self.onFilamentChanged = function(value)
        {
            // This function is bound to the change event of filament material and amount inputs
            // Therefore, we have to check if the controls are actually visible, to confirm the change was the user's own action
            if (self.isHeadMaintenanceFlyoutOpen && !self.isSavingMaterial()) {
                self.isSavingMaterial(true);
                self.filament.updateFilament(this).always(function () { self.isSavingMaterial(false) });
            }
        }

        self.onAfterBinding = function()
        {
            self.toolInfo.onToolsUpdated(function () {
                var tools = self.toolInfo.tools();
                for (i = 0; i < tools.length; i++) {
                    tools[i].filament.amountMeter.subscribe(self.onFilamentChanged.bind(tools[i]));
                    tools[i].filament.materialProfileName.subscribe(self.onFilamentChanged.bind(tools[i]));
                }
            });
        }

        self.onMaintenanceSettingsShown = function () {
            //IntroJS
            if (self.introView.isTutorialStarted) {
                self.introView.introInstance.goToStep(self.introView.getStepNumberByName("goToCalibrateBed"));
                self.introView.introInstance.refresh();
            }

            // Notify the back-end we're in maintenance mode
            sendToApi("maintenance/start");
        }

        self.onMaintenanceSettingsHidden = function () {
            // Notify the back-end we're done with maintenance mode
            sendToApi("maintenance/finish");
        }

        // Handle plugin messages
        self.onDataUpdaterPluginMessage = function (plugin, data) {
            if (plugin != "lui") {
                return;
            }

            var messageType = data['type'];
            switch (messageType) {
                case "head_in_swap_position":
                    self.finishHeadSwap();
                    break;
                case "powering_up_after_swap":
                    var title = gettext("Reconnecting to printer");
                    var message = gettext("Please wait while the printer is being reconnected. Note that the printer will home automatically.");
                    self.poweringUpInfo = self.flyout.showInfo(title, message, true);
                    break;
                case "powering_up_after_swap_failed":
                    if (self.poweringUpInfo != undefined) {
                        self.flyout.closeInfo(self.poweringUpInfo);
                    }

                    // Trigger a connection error flyout
                    self.printerState.requestData();
                    break;
                case "is_homed":
                    if (self.poweringUpInfo != undefined) {
                        self.flyout.closeInfo(self.poweringUpInfo);
                    }
                    break;
            }
        }
    }
    ADDITIONAL_VIEWMODELS.push([
        MaintenanceViewModel,
        ["flyoutViewModel", "printerStateViewModel", "settingsViewModel", "toolInfoViewModel", "filamentViewModel", "navigationViewModel", "introViewModel"],
        ["#maintenance_settings_flyout_content", "#head_maintenance_flyout"]
    ]);
});
