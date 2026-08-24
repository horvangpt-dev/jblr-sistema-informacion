# Fi_get_infrageneric.R
#'
#' @title Gets all accepted names in 'Flora iberica' within a genus
#'
#' @description Gets all accepted names in 'Flora iberica' within a genus, reading from http://www.floraiberica.es. Less relevant infraspecific taxa are usually not in the database or might be in the synonyms of higher taxa.
#'
#' @param genus A `chatracter` with a genus Latin name.
#'
#' @details This function reads from http://www.floraiberica.es and retrieves all accepted names within a given genus.
#'
#' @return A `list` with two components. The first component ('names') is a `matrix` with the found names and some 'Flora iberica' fields, or is `NULL` if no names are found in Flora iberica' (e.g. genus not accepted in 'Flora iberica' (e.g. a synonym), is mistyped or out of 'Flora iberica' scope, or belongs to a not yet published genus). A second component ('message') gives further information to the user.
#'
#' @author Tiago Monteiro-Henriques. E-mail: \email{tmh.dev@@icloud.com}.
#'
#' @export
#'
Fi_get_infrageneric <- function(genus) {
  if (is.null(genus)) {stop("Argument genus can not be NULL.")}
  Fi_result <- readLines(paste0("http://www.floraiberica.es/PHP/cientificos_.php?gen=", genus), warn=FALSE)
  if (any(grepl("taxon extraiberico o mal escrito", Fi_result))) {
    #In future: check if it is a synonym in Fi!
    return(list(names=NULL, message="Genus not accepted in Fi (synonym), or is mistyped, or out of Fi scope.")) #PODE TENTAR MELHORAR-SE O CASO
  }
  if (any(grepl("por desarrollar", Fi_result))) {
    return(list(names=NULL, message="Genus accepted in Fi but not published still."))
  }
  i <- grep("HREF =cientificos2.php\\?gen", Fi_result) #finds index of element with relevant names
  if (length(i)==0) {return(stop("Unexpected result: could not find any name, and usual message returned by Flora iberica to absent/mistyped names was not found either. Something went wrong. Please check code."))}

  temp1 <- strsplit(Fi_result[i], "</font>&nbsp;&nbsp;</dt><dt>")
  temp2 <- lapply(temp1, gsub, pattern="<b><i> </b></i>", replacement="")
  temp3 <- unlist(lapply(temp2, gsub, pattern="<i> </i>", replacement=""))
  temp4 <- unlist(lapply(temp3, function (x) {
    if (grepl(" x ", x)) {
      return(strsplit(x, "</a></dt>"))
    } else {return(x)}
  }))
  temp5 <- unlist(lapply(temp4, clean_stuff, stuff = c("<([^<>]*)>", "&nbsp;", "\t")))
  temp6 <- unlist(lapply(temp5, clean_whitespaces))
  temp7 <- temp6[!sapply(temp6, is.null)]
  temp8 <- temp7[!temp7==""]
  temp9 <- lapply(temp8, function (x) {
    if (grepl(" x ", x)) {return(c(name_and_auth=x, auth_and_ref=""))}
    if (grepl(", ", x)) {
      spl_ind <- regexpr(", ", x)
      if (spl_ind==-1) {return(c(name_and_auth=x, ref=""))}
      return(c(name_and_auth=substr(x, 1, spl_ind-1), ref=substr(x, spl_ind+2, nchar(x))))
    }
    if (grepl(" in ", x)) {
      spl_ind <- regexpr(" in ", x)
      if (spl_ind==-1) {return(c(name_and_auth=x, ref=""))}
      return(c(name_and_auth=substr(x, 1, spl_ind-1), ref=substr(x, spl_ind+4, nchar(x))))
    }
    return(c(name_and_auth=x, auth_and_ref=""))
  })

  #obtaining the genus abbreviation in use
  ind1 <- regexpr("^.{1,2}\\.", temp9[[2]][1]) #It assumes the second line begins always with the abbreviation of the genus.
  if (ind1==-1) {stop("Code assumes there is always an abbreviated genus name in the second line of the taxa list. That is failing. Check code and possibly recode accordingly.")}
  leng <- attributes(ind1)$match.length
  abbr <- substr(temp9[[2]][1], 1, leng)
  abbrev <- sub("\\.","\\\\\\.", abbr) #Attention, hibrids might have a different abbreviations (as e.g. in Cheilanthes).

  res <- t(sapply(temp9, function (x) {t(x)}))
  colnames(res) <- c("names_and_auth", "reference")
  not.hybrid <- !grepl(" x ", res[,1])
  res[,1][not.hybrid] <- sub(abbrev, genus, res[,1][not.hybrid]) #Don't use gsub before extracting authors, as some authors abbreviations are the same as the genus abbreviation #might be useful not to replace genus abbreviation in hybrids.
  return(list(names=res, message="Successful."))
}
